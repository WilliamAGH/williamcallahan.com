/**
 * Centralized Data Access Layer
 *
 * This module provides a unified way to access data for bookmarks,
 * GitHub activity, and logos, following the pattern:
 * 1. In-memory Cache (ServerCacheInstance)
 * 2. Filesystem Volume (data/{type}/{filename})
 * 3. External API
 *
 * It also handles writing back to the volume and cache after an external fetch.
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { UnifiedBookmark, GitHubActivityApiResponse, ContributionDay, GitHubGraphQLContributionResponse, LogoSource, RepoWeeklyStatCache, RepoRawWeeklyStat, AggregatedWeeklyActivity, GithubContributorStatsEntry, RepoRawWeeklyStat as GithubRepoRawWeeklyStatType } from '@/types'; // Assuming all types are in @/types
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, LOGO_SIZES } from '@/lib/constants'; // Assuming constants are in @/lib
import { graphql } from '@octokit/graphql'; // For GitHub GraphQL
import * as cheerio from 'cheerio'; // For GitHub scraping fallback
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { refreshBookmarksData } from '@/lib/bookmarks'; // Added import
import { readJsonS3, writeJsonS3, readBinaryS3, writeBinaryS3, listS3Objects as s3UtilsListS3Objects } from '@/lib/s3-utils';
import { s3Client } from '@/lib/s3';

// JSON read/write helpers for S3
async function readJsonFile<T>(s3Key: string): Promise<T | null> {
  return await readJsonS3<T>(s3Key);
}

async function writeJsonFile<T>(s3Key: string, data: T): Promise<void> {
  await writeJsonS3<T>(s3Key, data);
}

// --- Configuration & Constants ---
/**
 * The primary GitHub username for whom activity (contributions, repositories contributed to,
 * and lines of code changes) is fetched and processed. This user's activity is tracked
 * across all repositories they have contributed to, regardless of who owns those repositories.
 * Defaults to 'WilliamAGH' if the GITHUB_REPO_OWNER environment variable is not set.
 */
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'WilliamAGH'; // Default fallback if not configured
const GITHUB_API_TOKEN = process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH;
// const API_FETCH_TIMEOUT_MS = 30000; // Unused
const VERBOSE = process.env.VERBOSE === 'true' || false; // Ensure VERBOSE is defined at the module level

// Volume paths / S3 Object Keys
const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;

const GITHUB_ACTIVITY_S3_KEY_DIR = 'github-activity';
const GITHUB_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data.json`;
const GITHUB_STATS_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary.json`;

const LOGOS_S3_KEY_DIR = 'images/logos';

// GitHub Activity Data Paths / S3 Object Keys
const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = `${GITHUB_ACTIVITY_S3_KEY_DIR}/repo_raw_weekly_stats`;
const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/aggregated_weekly_activity.json`;

// Ensure directories exist (run once at startup or on first use)
// async function ensureDirectoryExists(dirPath: string) { // Removed - S3 doesn't have directories in the same way
//   try {
//     await fs.mkdir(dirPath, { recursive: true });
//   } catch (error) {
//     console.error(`[DataAccess] Failed to create directory ${dirPath}:`, error);
//     // Depending on severity, you might want to throw or handle differently
//   }
// }


// (async () => { // Removed - No directories to ensure for S3 at this stage
//   try {
//     // await ensureDirectoryExists(BOOKMARKS_VOLUME_DIR); // Removed
//     // await ensureDirectoryExists(GITHUB_ACTIVITY_VOLUME_DIR); // Removed
//     // await ensureDirectoryExists(REPO_RAW_WEEKLY_STATS_DIR); // Removed
//     // await ensureDirectoryExists(LOGOS_VOLUME_DIR); // Removed
//     console.log('[DataAccess] Data directories initialized successfully'); // This log might be misleading now
//   } catch (error) {
//     console.error('[DataAccess] CRITICAL ERROR: Failed to initialize one or more data directories:', error);
//     // In a real production scenario, you might want to:
//     // - Send an alert to an error monitoring service
//     // - Exit the process if these directories are absolutely essential for startup:
//     //   process.exit(1);
//   }
// })();


// --- Helper Functions ---

/**
 * Reads a binary file (e.g., an image) from S3.
 * @param s3Key Path to the file in S3.
 * @returns Buffer or null.
 */
async function readBinaryFile(s3Key: string): Promise<Buffer | null> {
  return await readBinaryS3(s3Key);
}

/**
 * Writes a binary file (e.g., an image) to S3.
 * @param s3Key Path to the file in S3.
 * @param data Buffer to write.
 */
async function writeBinaryFile(s3Key: string, data: Buffer): Promise<void> {
  await writeBinaryS3(s3Key, data, 'application/octet-stream');
}

/**
 * Lists objects in S3 under a given prefix.
 * @param prefix The prefix to filter objects by.
 * @returns An array of object keys, or an empty array if error or no objects.
 */
async function listS3Objects(prefix: string): Promise<string[]> {
  return await s3UtilsListS3Objects(prefix);
}

// --- Bookmarks Data Access ---

/**
 * Flag to prevent circular API calls
 * This is set when we're already in the process of fetching bookmarks
 * to prevent the API route from calling back into the data access layer
 */
// let isBookmarkFetchInProgress = false; // Replaced by inFlightBookmarkPromise
let inFlightBookmarkPromise: Promise<UnifiedBookmark[] | null> | null = null;

/**
 * Fetches bookmarks from the external source.
 * This implementation avoids circular API calls by directly fetching from the external source
 * instead of going through our own API endpoint.
 */
async function fetchExternalBookmarks(): Promise<UnifiedBookmark[] | null> {
  // If a fetch is already in progress, return that promise
  if (inFlightBookmarkPromise) {
    console.warn('[DataAccess] Bookmark fetch already in progress, returning existing promise.');
    return inFlightBookmarkPromise;
  }

  console.log('[DataAccess] Initiating new external bookmarks fetch...');
  // Create and store the promise for the current fetch operation
  inFlightBookmarkPromise = (async () => {
    try {
      // Call refreshBookmarksData from lib/bookmarks.ts
      const bookmarks = await refreshBookmarksData();

      if (bookmarks) {
        console.log(`[DataAccess] Fetched ${bookmarks.length} bookmarks from external source via refreshBookmarksData.`);
        return bookmarks;
      }
      return null; // Explicitly return null if refreshBookmarksData returns falsy
    } catch (error) {
      console.error('[DataAccess] Error fetching external bookmarks:', error);
      return null; // Ensure null is returned on error as per function signature
    } finally {
      // Reset the in-flight promise once the operation is complete (success or failure)
      inFlightBookmarkPromise = null;
      console.log('[DataAccess] External bookmarks fetch completed, inFlightBookmarkPromise reset.');
    }
  })();

  return inFlightBookmarkPromise;
}

// Helper to narrow unknown JSON to GitHubActivityApiResponse
function isGitHubActivityApiResponse(obj: unknown): obj is GitHubActivityApiResponse {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  const rec = obj as Record<string, unknown>;
  // Check that 'data' is an array
  if (!Array.isArray(rec['data'])) {
    return false;
  }
  // Check that 'dataComplete' is a boolean
  if (typeof rec['dataComplete'] !== 'boolean') {
    return false;
  }
  return true;
}

export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  // 1. Try Cache
  const cached = ServerCacheInstance.getBookmarks();
  if (cached && cached.bookmarks && cached.bookmarks.length > 0) {
    console.log('[DataAccess] Returning bookmarks from cache.');
    return cached.bookmarks;
  }

  // 2. Try S3 via Bun
  const bookmarksFile = s3Client.file(BOOKMARKS_S3_KEY_FILE);
  let s3Bookmarks: UnifiedBookmark[] | null = null;
  try {
    const raw = await bookmarksFile.json();
    if (Array.isArray(raw)) {
      s3Bookmarks = raw as UnifiedBookmark[];
    }
  } catch (error) {
    console.warn('[DataAccess-S3] Error reading bookmarks from S3:', error);
  }
  if (s3Bookmarks && s3Bookmarks.length > 0) {
    console.log('[DataAccess-S3] Returning bookmarks from S3.');
    ServerCacheInstance.setBookmarks(s3Bookmarks);
    return s3Bookmarks;
  }

  // 3. Fetch from External API (only if not explicitly skipped)
  if (!skipExternalFetch) {
    console.log('[DataAccess-S3] Bookmarks not in cache or S3, fetching from external source.');
    const externalBookmarks = await fetchExternalBookmarks();
    if (externalBookmarks) {
      // Write to S3 via Bun using writer
      const bookmarksWriter = bookmarksFile.writer();
      void bookmarksWriter.write(JSON.stringify(externalBookmarks));
      void bookmarksWriter.end();
      ServerCacheInstance.setBookmarks(externalBookmarks);
      return externalBookmarks;
    }
  } else {
    console.log('[DataAccess-S3] External fetch skipped as requested.');
  }

  console.warn('[DataAccess-S3] Failed to fetch bookmarks from all sources. Returning empty array.');
  return [];
}


// --- GitHub Activity Data Access ---

// (Re-using and adapting logic from app/api/github-activity/route.ts)
const mapContributionLevel = (level: string): 0 | 1 | 2 | 3 | 4 => {
  switch (level) {
    case 'NONE': return 0;
    case 'FIRST_QUARTILE': return 1;
    case 'SECOND_QUARTILE': return 2;
    case 'THIRD_QUARTILE': return 3;
    case 'FOURTH_QUARTILE': return 4;
    default: return 0;
  } // Corrected closing brace
}

// Unused function: extractNextPageUrl
// function extractNextPageUrl(linkHeader: string | null | undefined): string | null {
//   if (!linkHeader) return null;
//   const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
//   return matches && matches[1] ? matches[1] : null;
// }

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 5): Promise<Response> {
  let lastResponse: Response | null = null;
  let retryCount = 0;
  let delay = 1000;

  while (retryCount < maxRetries) {
    const response = await fetch(url, options);
    if (response.status !== 202) return response;
    console.log(`[DataAccess] GitHub API returned 202 for ${url}, waiting ${delay}ms before retry ${retryCount + 1}/${maxRetries}`);
    lastResponse = response;
    await new Promise(resolveRequest => setTimeout(resolveRequest, delay)); // Renamed resolve to avoid conflict
    delay *= 2;
    retryCount++;
  }
  if (!lastResponse) {
    throw new Error(`All ${maxRetries} retries returned 202 for ${url}`);
  }
  return lastResponse;
}

// Removed unused fetchAllRepositories function

async function fetchExternalGithubActivity(): Promise<GitHubActivityApiResponse | null> {
  if (!GITHUB_API_TOKEN) {
    console.warn('[DataAccess] GitHub API token is missing. Cannot fetch GitHub activity.');
    return null;
  }
  console.log(`[DataAccess] Fetching GitHub activity for ${GITHUB_REPO_OWNER} via GraphQL API...`);
  const now = new Date();
  const toDateIso = now.toISOString().split('T')[0] + 'T23:59:59Z';
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 365);
  const fromDateIso = fromDate.toISOString().split('T')[0] + 'T00:00:00Z';

  // Ensure REPO_RAW_WEEKLY_STATS_DIR exists - No longer needed for S3 explicitly,
  // as objects will be written to their keys directly.
  // await ensureDirectoryExists(REPO_RAW_WEEKLY_STATS_DIR);

  try {
    const { user } = await graphql<GitHubGraphQLContributionResponse>(`
      query($username: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $username) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks {
                contributionDays {
                  contributionCount
                  contributionLevel
                  date
                }
              }
              totalContributions
            }
            # commitContributionsByRepository is useful but let's try repositoriesContributedTo for a broader list
          }
          # Fetch repositories the user has contributed to (includes private if token has scope)
          repositoriesContributedTo(first: 100, contributionTypes: [COMMIT, PULL_REQUEST, REPOSITORY], includeUserRepositories: true, orderBy: {field: PUSHED_AT, direction: DESC}) {
            nodes {
              id
              name
              owner { login }
              nameWithOwner
              isFork
              isPrivate
            }
            # pageInfo { hasNextPage, endCursor } # For pagination if needed
          }
        }
      }
    `, { username: GITHUB_REPO_OWNER, from: fromDateIso, to: toDateIso, headers: { authorization: `bearer ${GITHUB_API_TOKEN}` } });

    // Define a type for the repository nodes from GraphQL for clarity
    type GithubRepoNode = NonNullable<NonNullable<GitHubGraphQLContributionResponse['user']>['repositoriesContributedTo']>['nodes'][number];

    const contributedRepoNodes = user.repositoriesContributedTo?.nodes || [];
    const allFetchedRepos = contributedRepoNodes.filter(
        (repo): repo is GithubRepoNode => !!(repo && !repo.isFork)
      );

    const uniqueReposMap = new Map<string, GithubRepoNode>();
    for (const repo of allFetchedRepos) {
        // The filter above ensures repo is not null and has the expected structure
        if (repo.id && typeof repo.id === 'string' && repo.id.length > 0) { // repo.id is already confirmed by GithubRepoNode type
            if (!uniqueReposMap.has(repo.id)) {
                uniqueReposMap.set(repo.id, repo);
            }
        } else {
            // This case should be less likely due to the typed filter, but good for robustness
            console.warn(`[DataAccess] fetchExternalGithubActivity: Repository object without a valid string ID or malformed (should be caught by type guards): ${JSON.stringify(repo).substring(0,150)}`);
        }
    }
    const uniqueRepoArray: GithubRepoNode[] = Array.from(uniqueReposMap.values());

    let linesAddedTotal365Days = 0;
    let linesRemovedTotal365Days = 0;
    let overallDataComplete = true; // Tracks if all repos were fetched successfully for stats
    const CONCURRENT_REPO_LIMIT = 5;

    // Initialize categories for LoC summary
    const categoryStats = {
      frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    };

    for (let i = 0; i < uniqueRepoArray.length; i += CONCURRENT_REPO_LIMIT) {
      const batch = uniqueRepoArray.slice(i, i + CONCURRENT_REPO_LIMIT);
      const batchPromises = batch.map(async (repo) => {
        if (!(repo && repo.owner && typeof repo.owner.login === 'string' && typeof repo.name === 'string')) {
            console.warn(`[DataAccess] fetchExternalGithubActivity: Skipping repo in batch due to missing/invalid owner.login or name: ${JSON.stringify(repo).substring(0,150)}`);
            return { repoName: 'unknown', currentRepoLinesAdded365: 0, currentRepoLinesRemoved365: 0, repoDataComplete: false };
        }
        const repoOwnerLogin = repo.owner.login;
        const repoName = repo.name;
        const repoStatFilename = `${repoOwnerLogin}_${repoName}.json`;
        const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoStatFilename}`; // Use S3 key
        let currentRepoDataComplete = true;
        let userWeeklyStats: RepoRawWeeklyStat[] = [];

        try {
          const statsUrl = `https://api.github.com/repos/${repoOwnerLogin}/${repoName}/stats/contributors`;
          const statsResponse = await fetchWithRetry(statsUrl, { headers: { 'Authorization': `Bearer ${GITHUB_API_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });

          let apiStatus: RepoWeeklyStatCache['status'] = 'fetch_error';

          if (statsResponse.status === 202) {
            console.warn(`[DataAccess] GitHub API returned 202 (pending) for ${repoOwnerLogin}/${repoName}. Stats will be incomplete.`);
            currentRepoDataComplete = false;
            apiStatus = 'pending_202_from_api';
            // Try to load existing data if API is pending
            const existingCache = await readBinaryFile(repoStatS3Key); // Read from S3
            if (existingCache) userWeeklyStats = existingCache.toString().split('\n').map(line => {
              const [w, a, d, c] = line.split(',');
              return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
            });

          } else if (statsResponse.ok) {
            const contributors = await statsResponse.json() as GithubContributorStatsEntry[];
            const userStatsEntry = Array.isArray(contributors) ? contributors.find(c => c.author && c.author.login === GITHUB_REPO_OWNER) : null;

            if (userStatsEntry && userStatsEntry.weeks && Array.isArray(userStatsEntry.weeks)) {
              userWeeklyStats = userStatsEntry.weeks.map((w: GithubRepoRawWeeklyStatType) => ({ w: w.w, a: w.a, d: w.d, c: w.c }));
              apiStatus = userWeeklyStats.length > 0 ? 'complete' : 'empty_no_user_contribs';
            } else {
              if (VERBOSE) console.log(`[DataAccess] No contribution stats for ${GITHUB_REPO_OWNER} in ${repoOwnerLogin}/${repoName} or weeks array is missing/empty.`);
              apiStatus = 'empty_no_user_contribs';
            }
          } else {
             console.warn(`[DataAccess] Error fetching stats for ${repoOwnerLogin}/${repoName}. Status: ${statsResponse.status}. Stats will be incomplete.`);
             currentRepoDataComplete = false;
             // Try to load existing data if API failed
             const existingCache = await readBinaryFile(repoStatS3Key); // Read from S3
             if (existingCache) userWeeklyStats = existingCache.toString().split('\n').map(line => {
               const [w, a, d, c] = line.split(',');
               return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
             });
          }

          // Incremental update logic for the raw weekly stats file
          let finalStatsToSave: RepoRawWeeklyStat[] = [];
          const existingRepoData = await readBinaryFile(repoStatS3Key); // Read from S3

          if (existingRepoData && userWeeklyStats.length > 0) { // Only merge if new data is good
            finalStatsToSave = userWeeklyStats.sort((a,b) => a.w - b.w);
          } else if (existingRepoData) { // Fallback to existing if API fetch failed entirely and we have old data
            finalStatsToSave = existingRepoData.toString().split('\n').map(line => {
              const [w, a, d, c] = line.split(',');
              return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
            });
          }

          await writeBinaryFile(repoStatS3Key, Buffer.from(finalStatsToSave.map(w => `${w.w},${w.a},${w.d},${w.c}`).join('\n'))); // Write to S3
          if (VERBOSE && (apiStatus === 'complete' || apiStatus === 'empty_no_user_contribs')) console.log(`[DataAccess-S3] Raw weekly stats for ${repoOwnerLogin}/${repoName} saved/updated to ${repoStatS3Key}. Status: ${apiStatus}, Weeks: ${finalStatsToSave.length}`);

          // Calculate lines for the 365-day window from potentially merged 'finalStatsToSave'
          let currentRepoLinesAdded365 = 0;
          let currentRepoLinesRemoved365 = 0;
          for (const week of finalStatsToSave) {
            const weekDate = new Date(week.w * 1000);
            if (weekDate >= fromDate && weekDate <= now) {
              currentRepoLinesAdded365 += week.a || 0;
              currentRepoLinesRemoved365 += week.d || 0;
            }
          }
          return { repoName, currentRepoLinesAdded365, currentRepoLinesRemoved365, repoDataComplete: currentRepoDataComplete };

        } catch (repoError: unknown) {
          const message = repoError instanceof Error ? repoError.message : String(repoError);
          console.warn(`[DataAccess] Critical error processing stats for ${repoOwnerLogin}/${repoName}:`, message);
          currentRepoDataComplete = false;
          // Attempt to write a cache entry indicating error, preserving old stats if any
          try {
            const existingRepoDataOnError = await readBinaryFile(repoStatS3Key); // Read from S3
            const errorCacheEntry: RepoWeeklyStatCache = {
              repoOwnerLogin,
              repoName,
              lastFetched: new Date().toISOString(),
              status: 'fetch_error',
              stats: existingRepoDataOnError ? existingRepoDataOnError.toString().split('\n').map(line => {
                const [w, a, d, c] = line.split(',');
                return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
              }) : [], // Preserve old stats on error
            };
            await writeBinaryFile(repoStatS3Key, Buffer.from(errorCacheEntry.stats.map(w => `${w.w},${w.a},${w.d},${w.c}`).join('\n'))); // Write to S3
          } catch (writeError: unknown) {
            const writeMessage = writeError instanceof Error ? writeError.message : String(writeError);
            console.error(`[DataAccess-S3] Failed to write error state for ${repoStatS3Key}:`, writeMessage);
          }
          return { repoName: repo.name || 'error_repo', currentRepoLinesAdded365: 0, currentRepoLinesRemoved365: 0, repoDataComplete: false };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        linesAddedTotal365Days += result.currentRepoLinesAdded365;
        linesRemovedTotal365Days += result.currentRepoLinesRemoved365;
        if (!result.repoDataComplete) {
          overallDataComplete = false;
        }

        // Categorize based on repo name
        const repoNameLower = result.repoName.toLowerCase();
        let categoryKey: keyof typeof categoryStats = 'other';

        if (repoNameLower.includes('front')) {
          categoryKey = 'frontend';
        } else if (repoNameLower.includes('back')) {
          categoryKey = 'backend';
        } else if (repoNameLower.includes('data') || repoNameLower.includes('scraping') || repoNameLower.includes('scraper')) {
          categoryKey = 'dataEngineer';
        }

        categoryStats[categoryKey].linesAdded += result.currentRepoLinesAdded365;
        categoryStats[categoryKey].linesRemoved += result.currentRepoLinesRemoved365;
        categoryStats[categoryKey].repoCount += 1;
      }

      // Calculate net change for each category
      (Object.keys(categoryStats) as Array<keyof typeof categoryStats>).forEach(key => {
        categoryStats[key].netChange = categoryStats[key].linesAdded - categoryStats[key].linesRemoved;
      });

    } // End of for loop for batches

    const contributionDays = user.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays as { contributionCount: number; contributionLevel: string; date: string }[]);
    const contributions: ContributionDay[] = contributionDays.map(d => ({
      date: d.date,
      count: d.contributionCount,
      level: mapContributionLevel(d.contributionLevel)
    }));
    const calculatedTotalContributions = contributionDays.reduce((sum: number, day: { contributionCount: number }) => sum + day.contributionCount, 0);

    // After processing all repos and their raw stats are saved,
    // now run the aggregation for aggregated_weekly_activity.json
    await calculateAndStoreAggregatedWeeklyActivity();

    const activityApiResponse: GitHubActivityApiResponse = {
      source: 'api',
      data: contributions,
      totalContributions: calculatedTotalContributions,
      linesAdded: linesAddedTotal365Days,
      linesRemoved: linesRemovedTotal365Days,
      dataComplete: overallDataComplete,
    };

    // Create and save the separate summary file
    try {
      const summaryS3Key = GITHUB_STATS_SUMMARY_S3_KEY_FILE; // Use S3 key constant
      const netLinesOfCode = (activityApiResponse.linesAdded || 0) - (activityApiResponse.linesRemoved || 0);
      const nowPacTime = new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
        timeZoneName: 'short'
      });

      const summaryData = {
        lastUpdatedAtPacific: nowPacTime,
        totalContributions: activityApiResponse.totalContributions.toString(), // Convert to string for summary file
        totalLinesAdded: activityApiResponse.linesAdded,
        totalLinesRemoved: activityApiResponse.linesRemoved,
        netLinesOfCode: netLinesOfCode,
        dataComplete: activityApiResponse.dataComplete,
        totalRepositoriesContributedTo: uniqueRepoArray.length, // Add total repo count
        linesOfCodeByCategory: categoryStats, // Add categorized stats - defined at line 417
      };
      await writeJsonFile(summaryS3Key, summaryData); // Write JSON to S3
      if (VERBOSE) console.log(`[DataAccess-S3] GitHub activity summary saved to ${summaryS3Key}`);
    } catch (summaryError) {
      console.error('[DataAccess-S3] Failed to write GitHub activity summary file:', summaryError);
      // Do not fail the main operation if only summary writing fails
    }

    // Return the aggregated GitHub activity response
    return activityApiResponse;
  } catch (error) {
    console.error('[DataAccess] Error fetching GitHub activity via GraphQL:', error);
    return await fetchGithubActivityByScraping(); // Fallback
  }
}

async function fetchGithubActivityByScraping(): Promise<GitHubActivityApiResponse | null> {
  console.warn(`[DataAccess] Attempting fallback scraping for GitHub activity for ${GITHUB_REPO_OWNER}...`);
  const profileUrl = `https://github.com/${GITHUB_REPO_OWNER}`;
  try {
    const response = await fetch(profileUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Failed to fetch profile page: ${response.status}`);
    const html = await response.text();
    const $ = cheerio.load(html);
    const contributions: ContributionDay[] = [];
    $('svg.js-calendar-graph-svg g > g > rect[data-date][data-level]').each((_, el) => {
      const $rect = $(el);
      const date = $rect.attr('data-date');
      const level = parseInt($rect.attr('data-level') || '0', 10);
      let count = 0;
      const tooltipId = $rect.attr('id');
      const tooltipText = tooltipId ? $(`tool-tip[for="${tooltipId}"]`).text().trim() : '';
      const countMatch = tooltipText.match(/^(\d+|No)\s+contribution/);
      if (countMatch && countMatch[1]) count = countMatch[1] === 'No' ? 0 : parseInt(countMatch[1], 10);
      if (date) contributions.push({ date, count, level: level as 0 | 1 | 2 | 3 | 4 });
    });
    const totalContributionsHeader = $('div.js-yearly-contributions h2').text().trim();
    const totalMatch = totalContributionsHeader.match(/([\d,]+)\s+contributions/i);
    const totalContributionsText = totalMatch && totalMatch[1] ? totalMatch[1].replace(/,/g, '') : '0';
    if (contributions.length === 0) console.warn('[DataAccess] Cheerio scraping found 0 contribution days.');
    return { source: 'scraping', data: contributions, totalContributions: parseInt(totalContributionsText, 10), linesAdded: 0, linesRemoved: 0, dataComplete: contributions.length > 0 };
  } catch (error) {
    console.error('[DataAccess] Error during GitHub scraping:', error);
    return null;
  }
}

export async function getGithubActivity(): Promise<GitHubActivityApiResponse | null> {
  // 1. Try Cache
  const cached = ServerCacheInstance.getGithubActivity();
  if (cached && cached.data && cached.data.length > 0 && cached.dataComplete) {
    console.log('[DataAccess] Returning GitHub activity from cache.');
    return cached;
  }

  // 2. Try S3 via Bun
  const activityFile = s3Client.file(GITHUB_ACTIVITY_S3_KEY_FILE);
  const rawActivity = await activityFile.json();
  const s3Activity = isGitHubActivityApiResponse(rawActivity)
    ? rawActivity
    : null;
  if (s3Activity && s3Activity.data && s3Activity.data.length > 0 && s3Activity.dataComplete) {
    console.log('[DataAccess-S3] Returning GitHub activity from S3.');
    ServerCacheInstance.setGithubActivity(s3Activity);
    return s3Activity;
  }

  // 3. Fetch from External API
  console.log('[DataAccess-S3] GitHub activity not in cache or S3 (or incomplete), fetching from external source.');
  const externalActivity = await fetchExternalGithubActivity();
  if (externalActivity) {
    // Write to S3 via Bun using writer
    const activityWriter = activityFile.writer();
    void activityWriter.write(JSON.stringify(externalActivity));
    void activityWriter.end();
    ServerCacheInstance.setGithubActivity(externalActivity);
    // Allow tests to override the returned value after fetching and writing
    const overrideGet = (globalThis as { getGithubActivity?: typeof getGithubActivity }).getGithubActivity;
    if (typeof overrideGet === 'function' && overrideGet !== getGithubActivity) {
      return overrideGet();
    }
    return externalActivity;
  }

  // If external fetch failed, but we have incomplete data in volume or cache, return that.
  if (s3Activity && s3Activity.data && s3Activity.data.length > 0) {
    console.warn('[DataAccess-S3] External GitHub fetch failed, returning incomplete data from S3.');
    ServerCacheInstance.setGithubActivity(s3Activity);
    return s3Activity;
  }
  if (cached && cached.data && cached.data.length > 0) {
    console.warn('[DataAccess-S3] External GitHub fetch failed, returning incomplete data from cache.');
    return cached;
  }

  console.warn('[DataAccess-S3] Failed to fetch GitHub activity from all sources.');
  return null;
}


// --- Logo Data Access ---

function getLogoS3Key(domain: string, source: LogoSource): string {
  const id = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return `${LOGOS_S3_KEY_DIR}/${id}_${sourceAbbr}.png`;
}

/**
 * Attempts to retrieve logo from S3 without performing external fetch.
 * @param domain Domain name for the logo.
 * @returns Buffer and source if found in S3, otherwise null.
 */
export async function findLogoInS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  // 1st: specific source keys
  for (const source of ['google', 'clearbit', 'duckduckgo'] as LogoSource[]) {
    const logoS3Key = getLogoS3Key(domain, source); // Use S3 key function
    const buffer = await readBinaryFile(logoS3Key); // Read from S3
    if (buffer) {
      console.log(`[DataAccess-S3] Found logo for ${domain} from source ${source} in S3.`);
      return { buffer, source };
    }
  }

  // Fallback: list objects by prefix
  try {
    const id = domain.split('.')[0];
    const keys = await listS3Objects(`${LOGOS_S3_KEY_DIR}/${id}_`);
    if (keys.length > 0) {
      const pngMatch = keys.find(key => key.endsWith('.png'));
      const bestMatch = pngMatch || keys[0];
      const buffer = await readBinaryFile(bestMatch);
      if (buffer) {
        let inferredSource: LogoSource = 'unknown';
        if (bestMatch.includes('_google')) inferredSource = 'google';
        else if (bestMatch.includes('_clearbit')) inferredSource = 'clearbit';
        else if (bestMatch.includes('_ddg')) inferredSource = 'duckduckgo';
        console.log(`[DataAccess-S3] Found logo for ${domain} by S3 list pattern match: ${bestMatch}`);
        return { buffer, source: inferredSource };
      }
    }
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.warn(`[DataAccess-S3] Error listing logos in S3 for domain ${domain} (prefix: ${LOGOS_S3_KEY_DIR}/${domain.split('.')[0]}_):`, message);
  }
  return null;
}

async function isImageLargeEnough(buffer: Buffer): Promise<boolean> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.format === 'svg') return true; // SVGs don't need size check here
    return !!(metadata.width && metadata.height && metadata.width >= LOGO_SIZES.MD && metadata.height >= LOGO_SIZES.MD);
  } catch { return false; }
}

// Simplified validation - actual validation API call is complex and might be out of scope for direct reuse here
// For now, we'll rely on size and non-generic patterns.
async function validateLogoBuffer(buffer: Buffer, url: string): Promise<boolean> {
  if (GENERIC_GLOBE_PATTERNS.some(pattern => pattern.test(url))) return false;
  if (!await isImageLargeEnough(buffer)) return false;
  // TODO: Consider adding a call to /api/validate-logo if essential and feasible from server-side lib
  return true;
}

async function fetchExternalLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> { // Removed baseUrlForValidation
  const sources: { name: LogoSource; urlFn: (domain: string) => string }[] = [
    { name: 'google', urlFn: LOGO_SOURCES.google.hd },
    { name: 'clearbit', urlFn: LOGO_SOURCES.clearbit.hd },
    { name: 'google', urlFn: LOGO_SOURCES.google.md },
    { name: 'clearbit', urlFn: LOGO_SOURCES.clearbit.md },
    { name: 'duckduckgo', urlFn: LOGO_SOURCES.duckduckgo.hd },
  ];

  for (const { name, urlFn } of sources) {
    const url = urlFn(domain);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      let response: Response;
      try {
        response = await fetch(url, { signal: controller.signal, headers: {'User-Agent': 'Mozilla/5.0'} });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) continue;
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (!rawBuffer || rawBuffer.byteLength < 100) continue; // Skip tiny/error images

      if (await validateLogoBuffer(rawBuffer, url)) {
        const { processedBuffer } = await processImageBuffer(rawBuffer);
        console.log(`[DataAccess] Fetched logo for ${domain} from ${name}.`);
        return { buffer: processedBuffer, source: name };
      }
    } catch (error: unknown) {
      if ((error as Error).name !== 'AbortError') {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[DataAccess] Error fetching logo for ${domain} from ${name} (${url}):`, message);
      }
    }
  }
  return null;
}


export async function getLogo(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  // Allow overriding getLogo in tests via global.getLogo
  const override = (globalThis as {getLogo?: typeof getLogo}).getLogo;
  if (typeof override === 'function' && override !== getLogo) {
    return override(domain);
  }
  // 1. Try Cache
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached && cached.buffer) {
    console.log(`[DataAccess-S3] Returning logo for ${domain} from cache (source: ${cached.source || 'unknown'}).`);
    const { contentType } = await processImageBuffer(cached.buffer);
    return { buffer: cached.buffer, source: cached.source || 'unknown', contentType };
  }

  const force = process.env.FORCE_LOGOS === 'true';
  if (force) console.log(`[DataAccess-S3] FORCE_LOGOS enabled, skipping S3 for ${domain}, forcing external fetch.`);
  // 2. Try S3
  let s3Logo: { buffer: Buffer; source: LogoSource } | null = null;
  if (!force) {
    s3Logo = await findLogoInS3(domain);
  }
  if (s3Logo) {
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: s3Logo.source, buffer: s3Logo.buffer });
    const { contentType } = await processImageBuffer(s3Logo.buffer);
    return { ...s3Logo, contentType };
  }

  // 3. Fetch from External API
  const skipExternalLogoFetch = process.env.NODE_ENV === 'test' || process.env.SKIP_EXTERNAL_LOGO_FETCH === 'true';
  if (skipExternalLogoFetch) {
    if (VERBOSE) console.log(`[DataAccess-S3] Skipping external logo fetch for ${domain} (test or skip flag).`);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'External fetch skipped' });
    return null;
  }
  console.log(`[DataAccess-S3] Logo for ${domain} not in cache or S3, fetching from external source.`);
  const externalLogo = await fetchExternalLogo(domain); // Removed baseUrlForValidation
  if (externalLogo) {
    const logoS3Key = getLogoS3Key(domain, externalLogo.source);
    try {
      const existingBuffer = await readBinaryFile(logoS3Key);
      let didUpload = false;
      if (existingBuffer) {
        const existingHash = createHash('md5').update(existingBuffer).digest('hex');
        const newHash = createHash('md5').update(externalLogo.buffer).digest('hex');
        if (existingHash === newHash) {
          console.log(`[DataAccess-S3] Logo for ${domain} unchanged (hash=${newHash}); skipping upload.`);
        } else {
          await writeBinaryFile(logoS3Key, externalLogo.buffer);
          console.log(`[DataAccess-S3] Logo for ${domain} changed (old=${existingHash}, new=${newHash}); uploaded to ${logoS3Key}.`);
          didUpload = true;
        }
      } else {
        await writeBinaryFile(logoS3Key, externalLogo.buffer);
        const newHash = createHash('md5').update(externalLogo.buffer).digest('hex');
        console.log(`[DataAccess-S3] New logo for ${domain}; uploaded to ${logoS3Key} (hash=${newHash}).`);
        didUpload = true;
      }
      if (VERBOSE && !didUpload) console.log(`[DataAccess-S3] VERBOSE: No upload needed for ${domain}.`);
    } catch (uploadError) {
      console.error(`[DataAccess-S3] Error writing logo for ${domain} to S3:`, uploadError);
    }
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: externalLogo.buffer });
    const { contentType } = await processImageBuffer(externalLogo.buffer);
    return { ...externalLogo, contentType };
  }

  console.warn(`[DataAccess-S3] Failed to fetch logo for ${domain} from all sources.`);
  // Cache failure to avoid retrying too often
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  return null;
}

// --- Investment Data for Logo Domains ---
// This function is specific to populate-volumes.js needs and might be better placed there
// or refactored if investments.ts becomes JSON.
// Import investments statically to avoid critical dependency warning
// THIS SECTION USES `fs.readFile` for a local `investments.ts` file.
// This part seems unrelated to the S3 volume migration for `data/*`
// and likely should remain as is, or its data source re-evaluated if it's meant to be in S3.
// For now, assuming `data/investments.ts` is a local config file.
import { investments } from '@/data/investments';

export async function getInvestmentDomainsAndIds(): Promise<Map<string, string>> {
  const domainToIdMap = new Map<string, string>();

  // Use the statically imported investments data
  try {
    if (investments && Array.isArray(investments)) {
      for (const investment of investments) {
        if (investment.id && investment.website) {
          try {
            const url = new URL(investment.website);
            const domain = url.hostname.replace(/^www\./, '');
            domainToIdMap.set(domain, investment.id);
          } catch { /* ignore invalid URLs */ }
        }
      }
      console.log(`[DataAccess] Successfully parsed ${domainToIdMap.size} investment domains via static import.`);
      return domainToIdMap;
    }
  } catch (importError: unknown) {
    console.warn(`[DataAccess] Could not use static import of investments.ts, falling back to regex parsing: ${String(importError)}`);

    // Fallback to regex parsing if static import fails
    const investmentsPath = 'data/investments.ts'; // Assuming this path is still local and not in S3.
                                                // If it IS in S3, this needs to use readJsonFile/readBinaryFile for S3.
                                                // Given its .ts extension, it's likely a source file.
      // Fallback to regex parsing if direct import fails (e.g. in a pure Node script without TS compilation)
      try {
        // This fs.readFile needs to be addressed if 'data/investments.ts' is supposed to be in S3.
        // For now, assuming it's a local file. If it's in S3, we'd use:
        // const investmentsContentBuffer = await readBinaryFile(investmentsPath);
        // const investmentsContent = investmentsContentBuffer ? investmentsContentBuffer.toString('utf-8') : null;
        // if (!investmentsContent) throw new Error('Failed to read investments data from S3');
        const localInvestmentsPath = process.cwd() + '/' + investmentsPath; // Construct full path for local read
        const investmentsContent = await (await import('node:fs/promises')).readFile(localInvestmentsPath, 'utf-8');

        // Regex logic from populate-volumes.js (simplified for brevity, ensure it's robust)
        let currentId: string | null = null;
            const investmentBlocks = investmentsContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);

        for (let i = 1; i < investmentBlocks.length; i++) {
            const block = investmentBlocks[i];
            if (!block) continue;

            const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
            if (idMatch && idMatch[1]) {
                currentId = idMatch[1];
                const urlPatterns = [
                    /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g, // Corrected
                    /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^/'"]+)['"]/g,    // Corrected
                ];
                for (const pattern of urlPatterns) {
                    let urlMatch: RegExpExecArray | null;
                    while ((urlMatch = pattern.exec(block)) !== null) {
                        const capturedDomain = urlMatch[1]; // capturedDomain is string | undefined
                        if (typeof capturedDomain === 'string') { // Type guard
                            const domain = capturedDomain; // domain is now safely string
                            if (currentId) {
                                domainToIdMap.set(domain, currentId);
                            }
                        }
                    }
                }
            }
        }
        console.log(`[DataAccess] Successfully parsed ${domainToIdMap.size} investment domains via regex.`);
      } catch (regexParseError: unknown) {
          const message = regexParseError instanceof Error ? regexParseError.message : String(regexParseError);
          console.error('[DataAccess] Failed to parse investment domains via regex:', message);
      }
  }
  return domainToIdMap;
}

// Type definitions moved to types/github.ts

export async function calculateAndStoreAggregatedWeeklyActivity(): Promise<{ aggregatedActivity: AggregatedWeeklyActivity[], overallDataComplete: boolean } | null> {
  // Skip aggregation in DRY RUN mode
  if (process.env.DRY_RUN === 'true') {
    if (VERBOSE) console.log('[DataAccess-S3] DRY RUN mode: skipping aggregated weekly activity calculation.');
    return null;
  }
  // Allow overriding calculateAndStoreAggregatedWeeklyActivity in tests via global.calculateAndStoreAggregatedWeeklyActivity
  const overrideCalc = (globalThis as { calculateAndStoreAggregatedWeeklyActivity?: typeof calculateAndStoreAggregatedWeeklyActivity }).calculateAndStoreAggregatedWeeklyActivity;
  if (typeof overrideCalc === 'function' && overrideCalc !== calculateAndStoreAggregatedWeeklyActivity) {
    return overrideCalc();
  }
  console.log('[DataAccess-S3] Calculating aggregated weekly activity...');

  let overallDataComplete = true;
  const weeklyTotals: { [weekStart: string]: { added: number; removed: number } } = {};

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);

  // Gather all raw stat JSON keys under the S3 prefix
  let s3StatFileKeys: string[] = [];
  try {
    console.log(`[DataAccess-S3] Listing objects in S3 with prefix: ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/`);
    s3StatFileKeys = await listS3Objects(REPO_RAW_WEEKLY_STATS_S3_KEY_DIR);
    if (VERBOSE) console.log(`[DataAccess-S3] Found ${s3StatFileKeys.length} potential stat files in S3.`);
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.error(`[DataAccess-S3] Aggregation: Error listing S3 objects in ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/:`, message);
    await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, []);
    return { aggregatedActivity: [], overallDataComplete: false };
  }

  // Filter only JSON file keys
  s3StatFileKeys = s3StatFileKeys.filter(key => key.endsWith('.json'));

  if (s3StatFileKeys.length === 0) {
    if (VERBOSE) console.log(`[DataAccess-S3] Aggregation: No raw weekly stat files found in S3 path ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/. Nothing to aggregate.`);
    await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, []);
    return { aggregatedActivity: [], overallDataComplete: true }; // Considered complete as there's nothing to process
  }

  for (const repoStatS3Key of s3StatFileKeys) { // Iterate over full S3 keys
    const repoData = await readJsonFile<RepoWeeklyStatCache>(repoStatS3Key);

    if (!repoData) {
      if (VERBOSE) console.warn(`[DataAccess-S3] Aggregation: Could not read or parse ${repoStatS3Key}, skipping.`);
      overallDataComplete = false;
      continue;
    }

    // Process status flags
    if (repoData.status !== 'complete' && repoData.status !== 'empty_no_user_contribs') {
      if (repoData.status === 'pending_202_from_api' || repoData.status === 'fetch_error') {
        overallDataComplete = false;
        if (VERBOSE) console.log(`[DataAccess-S3] Aggregation: Repo ${repoStatS3Key} data is status '${repoData.status}', marking overall as incomplete.`);
      }
      if (VERBOSE) console.log(`[DataAccess-S3] Aggregation: Skipping repo ${repoStatS3Key} due to status: ${repoData.status}.`);
      continue;
    }

    // Accumulate weekly totals from parsed stats
    if (repoData.stats && repoData.stats.length > 0) {
      for (const week of repoData.stats) {
        const weekDate = new Date(week.w * 1000);
        if (weekDate >= oneYearAgo && weekDate <= today) {
          const weekKey = weekDate.toISOString().split('T')[0];
          if (!weeklyTotals[weekKey]) weeklyTotals[weekKey] = { added: 0, removed: 0 };
          weeklyTotals[weekKey].added += week.a || 0;
          weeklyTotals[weekKey].removed += week.d || 0;
        }
      }
    } else if (VERBOSE && repoData.status === 'complete') {
      console.log(`[DataAccess-S3] Aggregation: Repo ${repoStatS3Key} has 'complete' status but no stats data to process.`);
    }
  }

  if (VERBOSE) console.log(`[DataAccess-S3] Aggregation: Processed ${s3StatFileKeys.length} S3 stat files from ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}.`);

  const aggregatedActivity: AggregatedWeeklyActivity[] = Object.entries(weeklyTotals)
    .map(([weekStartDate, totals]) => ({
      weekStartDate,
      linesAdded: totals.added,
      linesRemoved: totals.removed,
    }))
    .sort((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());

  await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, aggregatedActivity);
  console.log(`[DataAccess-S3] Aggregated weekly activity calculated and stored to ${AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE}. Total weeks aggregated: ${aggregatedActivity.length}. Overall data complete: ${overallDataComplete}`);
  return { aggregatedActivity, overallDataComplete };
}

/**
 * Determines if an image is SVG and processes it accordingly
 * @param buffer The image buffer
 * @returns Object with processed buffer, whether it's SVG, and appropriate content type
 */
async function processImageBuffer(buffer: Buffer): Promise<{
  processedBuffer: Buffer;
  isSvg: boolean;
  contentType: string
}> {
  try {
    const metadata = await sharp(buffer).metadata();
    const isSvg = metadata.format === 'svg';
    const contentType = isSvg ? 'image/svg+xml' : 'image/png';
    const processedBuffer = isSvg ? buffer : await sharp(buffer).png().toBuffer();
    return { processedBuffer, isSvg, contentType };
  } catch (error: unknown) {
    // Fallback for unsupported or dummy image data
    console.warn(`[DataAccess] processImageBuffer fallback for buffer: ${String(error)}`);
    return { processedBuffer: buffer, isSvg: false, contentType: 'image/png' };
  }
}

/**
 * Serves a logo from S3 only, without external fetch. Used for API routes to avoid direct external calls.
 * @param domain Domain name for the logo.
 * @returns Buffer, source, and contentType if found, otherwise null.
 */
export async function serveLogoFromS3(domain: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  const s3Logo = await findLogoInS3(domain);
  if (!s3Logo) return null;
  const { buffer, source } = s3Logo;
  const { processedBuffer, contentType } = await processImageBuffer(buffer);
  return { buffer: processedBuffer, source, contentType };
}
