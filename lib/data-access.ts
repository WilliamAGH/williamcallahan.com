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
import type { UnifiedBookmark, GitHubActivityApiResponse, GitHubActivitySegment, ContributionDay, GitHubGraphQLContributionResponse, LogoSource, RepoWeeklyStatCache, RepoRawWeeklyStat, AggregatedWeeklyActivity, GithubContributorStatsEntry, RawGitHubActivityApiResponse } from '@/types';
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, LOGO_SIZES } from '@/lib/constants'; // Assuming constants are in @/lib
import { graphql } from '@octokit/graphql'; // For GitHub GraphQL
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { refreshBookmarksData } from '@/lib/bookmarks'; // Added import
import { writeJsonS3, readBinaryS3, writeBinaryS3, listS3Objects as s3UtilsListS3Objects } from '@/lib/s3-utils';
import { s3Client } from '@/lib/s3';

// JSON write helper for S3 (used for summary file)
async function writeJsonFile<T>(s3Key: string, data: T): Promise<void> {
  await writeJsonS3<T>(s3Key, data);
}

// Helper to wrap raw GitHub activity into nested API response
function wrapGithubActivity(fetchedParts: {trailingYearData: RawGitHubActivityApiResponse, allTimeData: RawGitHubActivityApiResponse} | null): GitHubActivityApiResponse | null {
  if (!fetchedParts || !fetchedParts.trailingYearData || !fetchedParts.allTimeData) {
    console.warn('[DataAccess] wrapGithubActivity received null or incomplete parts.');
    return null;
  }
  // Convert RawGitHubActivityApiResponse to GitHubActivitySegment by adding an empty summaryActivity placeholder
  const trailingYearSegment: GitHubActivitySegment = { ...fetchedParts.trailingYearData, summaryActivity: undefined };
  const cumulativeAllTimeSegment: GitHubActivitySegment = { ...fetchedParts.allTimeData, summaryActivity: undefined };

  return {
    trailingYearData: trailingYearSegment,
    cumulativeAllTimeData: cumulativeAllTimeSegment,
  };
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
export const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
export const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;

export const GITHUB_ACTIVITY_S3_KEY_DIR = 'github-activity';
export const GITHUB_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data.json`;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary.json`;

export const LOGOS_S3_KEY_DIR = 'images/logos';

// GitHub Activity Data Paths / S3 Object Keys
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = `${GITHUB_ACTIVITY_S3_KEY_DIR}/repo_raw_weekly_stats`;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/aggregated_weekly_activity.json`;

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

// Helper to narrow unknown JSON to RawGitHubActivityApiResponse
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isGitHubActivityApiResponse(obj: unknown): obj is RawGitHubActivityApiResponse {
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

// Helper to map commit counts into heatmap levels
function mapCommitLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

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

const CONCURRENT_REPO_LIMIT = 5; // Module-level constant

/** Fetch from GitHub API and build raw stats */
async function fetchExternalGithubActivity(): Promise<{trailingYearData: RawGitHubActivityApiResponse, allTimeData: RawGitHubActivityApiResponse} | null> {
  if (!GITHUB_API_TOKEN) {
    console.warn('[DataAccess] GitHub API token is missing. Cannot fetch GitHub activity.');
    return null;
  }
  console.log(`[DataAccess] Initiating GitHub activity fetch for ${GITHUB_REPO_OWNER}...`);
  const now = new Date();

  type GithubRepoNode = NonNullable<NonNullable<GitHubGraphQLContributionResponse['user']>['repositoriesContributedTo']>['nodes'][number];

  let uniqueRepoArray: GithubRepoNode[];
  try {
    console.log(`[DataAccess] Fetching list of contributed repositories for ${GITHUB_REPO_OWNER} via GraphQL API...`);
    const { user } = await graphql<GitHubGraphQLContributionResponse>(`
      query($username: String!) {
        user(login: $username) {
          repositoriesContributedTo(
            first: 100,
            contributionTypes: [COMMIT],
            includeUserRepositories: true,
            orderBy: { field: PUSHED_AT, direction: DESC }
          ) {
            nodes {
              id
              name
              owner { login }
              nameWithOwner
              isFork
              isPrivate
            }
          }
        }
      }
    `, { username: GITHUB_REPO_OWNER, headers: { authorization: `bearer ${GITHUB_API_TOKEN}` } });
    const contributedRepoNodes = user.repositoriesContributedTo?.nodes || [];
    uniqueRepoArray = contributedRepoNodes.filter((repo): repo is GithubRepoNode => !!(repo && !repo.isFork));
  } catch (gqlError) {
    console.error("[DataAccess] CRITICAL: Failed to fetch repository list via GraphQL:", gqlError);
    return null; // Cannot proceed without repo list
  }

  if (uniqueRepoArray.length === 0) {
    console.warn("[DataAccess] No non-forked repositories contributed to found for user.");
    // Return empty but valid structure
    const emptyRawResponse: RawGitHubActivityApiResponse = { source: 'api', data: [], totalContributions: 0, linesAdded: 0, linesRemoved: 0, dataComplete: true };
    return { trailingYearData: emptyRawResponse, allTimeData: emptyRawResponse };
  }

  // --- TRAILING YEAR CALCULATIONS ---
  console.log('[DataAccess] Calculating trailing year stats...');
  const trailingYearFromDate = new Date(now);
  trailingYearFromDate.setDate(now.getDate() - 365);
  const trailingYearSinceIso = trailingYearFromDate.toISOString().split('T')[0] + 'T00:00:00Z';
  const trailingYearUntilIso = now.toISOString().split('T')[0] + 'T23:59:59Z';

  let yearLinesAdded = 0;
  let yearLinesRemoved = 0;
  let yearOverallDataComplete = true;
  const yearCategoryStats = { frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 } };
  const yearDailyCommitCounts = new Map<string, number>();

  for (let i = 0; i < uniqueRepoArray.length; i += CONCURRENT_REPO_LIMIT) {
    const batch = uniqueRepoArray.slice(i, i + CONCURRENT_REPO_LIMIT);
    const batchPromises = batch.map(async (repo) => {
      const repoOwnerLogin = repo.owner.login;
      const repoName = repo.name;
      const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwnerLogin}_${repoName}.csv`;
      let currentRepoLinesAdded365 = 0;
      let currentRepoLinesRemoved365 = 0;
      let repoDataCompleteForYear = true;
      let apiStatus: RepoWeeklyStatCache['status'] = 'fetch_error';
      let finalStatsToSaveForRepo: RepoRawWeeklyStat[] = [];

      try {
        const statsResponse = await fetchWithRetry(`https://api.github.com/repos/${repoOwnerLogin}/${repoName}/stats/contributors`, { headers: { 'Authorization': `Bearer ${GITHUB_API_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
        let userWeeklyStatsFromApi: RepoRawWeeklyStat[] = [];

        if (statsResponse.status === 202) {
          apiStatus = 'pending_202_from_api';
          repoDataCompleteForYear = false;
          if (VERBOSE) console.log(`[DataAccess] Trailing Year: GitHub API returned 202 (pending) for ${repoOwnerLogin}/${repoName}.`);
        } else if (statsResponse.ok) {
          const contributors = await statsResponse.json() as GithubContributorStatsEntry[];
          const ownerLoginLower = GITHUB_REPO_OWNER.toLowerCase();
          const userStatsEntry = Array.isArray(contributors) ? contributors.find(c => c.author && c.author.login.toLowerCase() === ownerLoginLower) : null;
          if (userStatsEntry && userStatsEntry.weeks && Array.isArray(userStatsEntry.weeks)) {
            userWeeklyStatsFromApi = userStatsEntry.weeks.map((w: RepoRawWeeklyStat) => ({ w: w.w, a: w.a, d: w.d, c: w.c }));
            apiStatus = userWeeklyStatsFromApi.length > 0 ? 'complete' : 'empty_no_user_contribs';
          } else {
            apiStatus = 'empty_no_user_contribs';
          }
        } else {
          repoDataCompleteForYear = false;
          if (VERBOSE) console.warn(`[DataAccess] Trailing Year: Error fetching stats for ${repoOwnerLogin}/${repoName}. Status: ${statsResponse.status}.`);
        }

        if (apiStatus === 'complete' && userWeeklyStatsFromApi.length > 0) {
          finalStatsToSaveForRepo = userWeeklyStatsFromApi.sort((a,b) => a.w - b.w);
        } else {
          const existingDataBuffer = await readBinaryFile(repoStatS3Key);
          if (existingDataBuffer && existingDataBuffer.length > 0) {
            if (VERBOSE) console.log(`[DataAccess-S3] Trailing Year: Using existing S3 CSV data for ${repoOwnerLogin}/${repoName} due to API status: ${apiStatus}`);
            finalStatsToSaveForRepo = existingDataBuffer.toString().split('\n').filter(Boolean).map(line => {
              const [w, a, d, c] = line.split(',');
              return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
            });
          } else {
             if (apiStatus === 'pending_202_from_api' || apiStatus === 'fetch_error') repoDataCompleteForYear = false;
          }
        }

        if (finalStatsToSaveForRepo.length > 0 && (apiStatus === 'complete' || apiStatus === 'empty_no_user_contribs' || (apiStatus !== 'fetch_error' && apiStatus !== 'pending_202_from_api' && finalStatsToSaveForRepo.length >0) )) {
           await writeBinaryFile(repoStatS3Key, Buffer.from(finalStatsToSaveForRepo.map(w => `${w.w},${w.a},${w.d},${w.c}`).join('\n')));
           if (VERBOSE) console.log(`[DataAccess-S3] Trailing Year: CSV for ${repoOwnerLogin}/${repoName} updated/written. Weeks: ${finalStatsToSaveForRepo.length}. API Status: ${apiStatus}`);
        } else if (finalStatsToSaveForRepo.length === 0 && (apiStatus === 'pending_202_from_api' || apiStatus === 'fetch_error')) {
            console.warn(`[DataAccess-S3] Trailing Year: No stats data to save for ${repoOwnerLogin}/${repoName} (API status: ${apiStatus}, no usable existing S3 data). CSV not written.`);
            repoDataCompleteForYear = false;
        }

        for (const week of finalStatsToSaveForRepo) {
          const weekDate = new Date(week.w * 1000);
          if (weekDate >= trailingYearFromDate && weekDate <= now) {
            currentRepoLinesAdded365 += week.a || 0;
            currentRepoLinesRemoved365 += week.d || 0;
          }
        }
      } catch (repoError: unknown) {
          console.warn(`[DataAccess] Trailing Year: Critical error processing stats for ${repoOwnerLogin}/${repoName}:`, repoError instanceof Error ? repoError.message : String(repoError));
          repoDataCompleteForYear = false;
      }

      yearLinesAdded += currentRepoLinesAdded365;
      yearLinesRemoved += currentRepoLinesRemoved365;
      if (!repoDataCompleteForYear) yearOverallDataComplete = false;

      const repoNameLower = repo.name.toLowerCase();
      let categoryKey: keyof typeof yearCategoryStats = 'other';
      if (repoNameLower.includes('front')) categoryKey = 'frontend';
      else if (repoNameLower.includes('back')) categoryKey = 'backend';
      else if (repoNameLower.includes('data') || repoNameLower.includes('scraping')) categoryKey = 'dataEngineer';

      if (currentRepoLinesAdded365 > 0 || currentRepoLinesRemoved365 > 0 || repoDataCompleteForYear ) {
        yearCategoryStats[categoryKey].linesAdded += currentRepoLinesAdded365;
        yearCategoryStats[categoryKey].linesRemoved += currentRepoLinesRemoved365;
        yearCategoryStats[categoryKey].repoCount +=1;
        yearCategoryStats[categoryKey].netChange = (yearCategoryStats[categoryKey].netChange || 0) + (currentRepoLinesAdded365 - currentRepoLinesRemoved365);
      }
    });
    await Promise.all(batchPromises);
  }

  console.log('[DataAccess] Trailing Year: Calculating daily commit counts...');
  for (const repo of uniqueRepoArray) {
    const owner = repo.owner.login;
    const name = repo.name;
    let page = 1;
    while (true) {
      const commitsUrl = `https://api.github.com/repos/${owner}/${name}/commits?author=${GITHUB_REPO_OWNER}&since=${trailingYearSinceIso}&until=${trailingYearUntilIso}&per_page=100&page=${page}`;
      const res = await fetch(commitsUrl, { headers: { 'Authorization': `Bearer ${GITHUB_API_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
      if (!res.ok) break;
      const commits = await res.json() as Array<{ commit: { author: { date: string } } }>;
      if (!Array.isArray(commits) || commits.length === 0) break;
      for (const c of commits) {
        const d = c.commit.author.date.slice(0, 10);
        yearDailyCommitCounts.set(d, (yearDailyCommitCounts.get(d) || 0) + 1);
      }
      if (commits.length < 100) break;
      page++;
    }
  }
  const trailingYearContributionsCalendar: ContributionDay[] = [];
  const yearCursor = new Date(trailingYearFromDate);
  while (yearCursor <= now) {
    const dayKey = yearCursor.toISOString().slice(0, 10);
    const count = yearDailyCommitCounts.get(dayKey) || 0;
    trailingYearContributionsCalendar.push({ date: dayKey, count, level: mapCommitLevel(count) });
    yearCursor.setDate(yearCursor.getDate() + 1);
  }
  const yearTotalCommits = Array.from(yearDailyCommitCounts.values()).reduce((a, b) => a + b, 0);

  const trailingYearData: RawGitHubActivityApiResponse = {
    source: 'api',
    data: trailingYearContributionsCalendar,
    totalContributions: yearTotalCommits,
    linesAdded: yearLinesAdded,
    linesRemoved: yearLinesRemoved,
    dataComplete: yearOverallDataComplete,
  };

  try {
    const summaryS3Key = GITHUB_STATS_SUMMARY_S3_KEY_FILE;
    const netYearLoc = (trailingYearData.linesAdded || 0) - (trailingYearData.linesRemoved || 0);
    const yearSummaryData = {
      lastUpdatedAtPacific: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' }),
      totalContributions: trailingYearData.totalContributions.toString(),
      totalLinesAdded: trailingYearData.linesAdded,
      totalLinesRemoved: trailingYearData.linesRemoved,
      netLinesOfCode: netYearLoc,
      dataComplete: trailingYearData.dataComplete,
      totalRepositoriesContributedTo: uniqueRepoArray.length,
      linesOfCodeByCategory: yearCategoryStats,
    };
    await writeJsonFile(summaryS3Key, yearSummaryData);
    if (VERBOSE) console.log(`[DataAccess-S3] Trailing year GitHub summary saved to ${summaryS3Key}`);
  } catch (summaryError) { console.error('[DataAccess-S3] Failed to write trailing year GitHub summary:', summaryError); }

  // --- ALL-TIME CALCULATIONS ---
  console.log('[DataAccess] Calculating all-time stats...');
  let allTimeLinesAdded = 0;
  let allTimeLinesRemoved = 0;
  let allTimeOverallDataComplete = true;
  const allTimeCategoryStats = { frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 }, other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 } };
  let allTimeTotalCommits = 0;

  for (let i = 0; i < uniqueRepoArray.length; i += CONCURRENT_REPO_LIMIT) {
    const batch = uniqueRepoArray.slice(i, i + CONCURRENT_REPO_LIMIT);
    const batchPromises = batch.map(async (repo) => {
      const repoOwnerLogin = repo.owner.login;
      const repoName = repo.name;
      const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwnerLogin}_${repoName}.csv`; //Ensure these are CSVs
      let currentRepoLinesAddedAllTime = 0;
      let currentRepoLinesRemovedAllTime = 0;
      let repoS3DataProcessed = true;

      try {
        const s3Buffer = await readBinaryFile(repoStatS3Key);
        if (s3Buffer && s3Buffer.length > 0) {
          const lines = s3Buffer.toString().split('\n').filter(Boolean);
          for (const line of lines) {
            const [,a,d] = line.split(',');
            currentRepoLinesAddedAllTime += Number(a) || 0;
            currentRepoLinesRemovedAllTime += Number(d) || 0;
          }
        } else {
          if (VERBOSE) console.warn(`[DataAccess-S3] All-time LoC: No data in ${repoStatS3Key} for ${repoName}.`);
          repoS3DataProcessed = false;
        }
      } catch (err) {
          console.warn(`[DataAccess-S3] All-time LoC: Error reading ${repoStatS3Key} for ${repoName}:`, err instanceof Error ? err.message : String(err));
          repoS3DataProcessed = false;
      }

      allTimeLinesAdded += currentRepoLinesAddedAllTime;
      allTimeLinesRemoved += currentRepoLinesRemovedAllTime;
      if (!repoS3DataProcessed) allTimeOverallDataComplete = false;

      const repoNameLower = repo.name.toLowerCase();
      let categoryKey: keyof typeof allTimeCategoryStats = 'other';
      if (repoNameLower.includes('front')) categoryKey = 'frontend';
      else if (repoNameLower.includes('back')) categoryKey = 'backend';
      else if (repoNameLower.includes('data') || repoNameLower.includes('scraping')) categoryKey = 'dataEngineer';

      if (repoS3DataProcessed) {
        allTimeCategoryStats[categoryKey].linesAdded += currentRepoLinesAddedAllTime;
        allTimeCategoryStats[categoryKey].linesRemoved += currentRepoLinesRemovedAllTime;
        allTimeCategoryStats[categoryKey].repoCount +=1;
        allTimeCategoryStats[categoryKey].netChange = (allTimeCategoryStats[categoryKey].netChange || 0) + (currentRepoLinesAddedAllTime - currentRepoLinesRemovedAllTime);
      }
    });
    await Promise.all(batchPromises);
  }

  console.log('[DataAccess] All-Time: Calculating daily commit counts (all-time)...');
  for (const repo of uniqueRepoArray) {
      const owner = repo.owner.login;
      const name = repo.name;
      let page = 1;
      while (true) {
          const commitsUrl = `https://api.github.com/repos/${owner}/${name}/commits?author=${GITHUB_REPO_OWNER}&per_page=100&page=${page}`;
          const res = await fetch(commitsUrl, { headers: { 'Authorization': `Bearer ${GITHUB_API_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
          if (!res.ok) {
            if(res.status !== 404 && res.status !== 409) {
                 console.warn(`[DataAccess] All-time commits: Error fetching page ${page} for ${owner}/${name}. Status: ${res.status}`);
            }
            break;
          }
          const commits = await res.json() as Array<{ sha: string }>; // Just need count
          if (!Array.isArray(commits) || commits.length === 0) break;
          allTimeTotalCommits += commits.length;
          if (commits.length < 100) break;
          page++;
      }
  }
  if (VERBOSE) console.log(`[DataAccess] All-time total commits calculated: ${allTimeTotalCommits}`);

  const allTimeData: RawGitHubActivityApiResponse = {
    source: 'api',
    data: [], // No daily calendar for all-time (this is just the totals object)
    totalContributions: allTimeTotalCommits,
    linesAdded: allTimeLinesAdded,
    linesRemoved: allTimeLinesRemoved,
    dataComplete: allTimeOverallDataComplete,
  };

  try {
    const ALL_TIME_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary_all_time.json`;
    const netAllTimeLoc = (allTimeData.linesAdded || 0) - (allTimeData.linesRemoved || 0);
    const allTimeSummaryData = {
      lastUpdatedAtPacific: new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZoneName: 'short' }),
      totalContributions: allTimeData.totalContributions.toString(),
      totalLinesAdded: allTimeData.linesAdded,
      totalLinesRemoved: allTimeData.linesRemoved,
      netLinesOfCode: netAllTimeLoc,
      dataComplete: allTimeData.dataComplete,
      totalRepositoriesContributedTo: uniqueRepoArray.length,
      linesOfCodeByCategory: allTimeCategoryStats,
    };
    await writeJsonFile(ALL_TIME_SUMMARY_S3_KEY_FILE, allTimeSummaryData);
    if (VERBOSE) console.log(`[DataAccess-S3] All-time GitHub summary saved to ${ALL_TIME_SUMMARY_S3_KEY_FILE}`);
  } catch (summaryError) { console.error('[DataAccess-S3] Failed to write all-time GitHub summary:', summaryError); }

  // The main activity_data.json is ONLY the trailingYearData (with calendar)
  try {
    const activityFile = s3Client.file(GITHUB_ACTIVITY_S3_KEY_FILE);
    const activityWriter = activityFile.writer();
    void activityWriter.write(JSON.stringify(trailingYearData)); // Save only trailing year raw data with calendar
    void activityWriter.end();
    if (VERBOSE) console.log(`[DataAccess-S3] Trailing year raw activity data (with calendar) saved to ${GITHUB_ACTIVITY_S3_KEY_FILE}`);
  } catch (writeError) { console.error(`[DataAccess-S3] Error writing trailing year activity data to ${GITHUB_ACTIVITY_S3_KEY_FILE}:`, writeError); }

  // Aggregated weekly activity (for LoC graph) should be based on ALL data in S3 CSVs
  await calculateAndStoreAggregatedWeeklyActivity(); // This reads all CSVs and sums ALL weeks

  return { trailingYearData, allTimeData };
}

/** Returns cached/S3/raw GitHub activity as flat object */
export async function getGithubActivity(): Promise<GitHubActivityApiResponse | null> {
  const cached = ServerCacheInstance.getGithubActivity();
  // The cache stores the final GitHubActivityApiResponse shape (with undefined summaries initially)
  if (cached && cached.trailingYearData && cached.trailingYearData.data.length > 0 && cached.trailingYearData.dataComplete && cached.cumulativeAllTimeData) {
    console.log('[DataAccess] Returning GitHub activity from cache.');
    return cached;
  }

  // fetchExternalGithubActivity now returns { trailingYearData, allTimeData } (raw parts)
  // It also handles writing:
  // 1. activity_data.json (with raw trailingYearData including calendar)
  // 2. github_stats_summary.json (from trailing year calculations)
  // 3. github_stats_summary_all_time.json (from all-time calculations)
  console.log('[DataAccess] GitHub activity not in cache or S3 needs refresh, fetching from external source.');
  const externalRawParts = await fetchExternalGithubActivity();

  if (externalRawParts && externalRawParts.trailingYearData && externalRawParts.allTimeData) {
    const wrappedForApi = wrapGithubActivity(externalRawParts);
    if (wrappedForApi) {
      ServerCacheInstance.setGithubActivity(wrappedForApi); // Cache the structure API route expects (sans summaries)
      return wrappedForApi;
    }
  }

  // Fallback: If external fetch failed, try to serve at least trailing year from S3 if GITHUB_ACTIVITY_S3_KEY_FILE exists
  console.warn('[DataAccess] External GitHub fetch failed. Attempting to use S3 fallback for trailing year data.');
  const activityFile = s3Client.file(GITHUB_ACTIVITY_S3_KEY_FILE);
  try {
    const rawTrailingYearFromS3 = await activityFile.json().catch(() => null) as RawGitHubActivityApiResponse | null;
    if (rawTrailingYearFromS3 && rawTrailingYearFromS3.data && rawTrailingYearFromS3.data.length > 0) {
      console.warn('[DataAccess-S3] External GitHub fetch failed, returning ONLY trailing year data from S3.');
      // Ensure all required fields for RawGitHubActivityApiResponse are present or defaulted for the placeholder
      const validRawTrailingYear = {
        source: rawTrailingYearFromS3.source || 's3_fallback',
        data: rawTrailingYearFromS3.data,
        totalContributions: rawTrailingYearFromS3.totalContributions || 0,
        linesAdded: rawTrailingYearFromS3.linesAdded,
        linesRemoved: rawTrailingYearFromS3.linesRemoved,
        dataComplete: rawTrailingYearFromS3.dataComplete !== undefined ? rawTrailingYearFromS3.dataComplete : false,
      };
      const partialResponse: GitHubActivityApiResponse = {
        trailingYearData: { ...validRawTrailingYear, summaryActivity: undefined },
        cumulativeAllTimeData: { source: 'api', data:[], totalContributions:0, linesAdded:0, linesRemoved:0, dataComplete: false, summaryActivity: undefined },
        error: "External fetch failed, using stale S3 trailing year data. All-time data unavailable."
      };
      ServerCacheInstance.setGithubActivity(partialResponse, true);
      return partialResponse;
    }
  } catch (s3Error) {
    console.error(`[DataAccess-S3] Error reading S3 fallback ${GITHUB_ACTIVITY_S3_KEY_FILE}:`, s3Error);
  }

  console.warn('[DataAccess-S3] Failed to fetch GitHub activity from all sources and no S3 fallback available.');
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
  s3StatFileKeys = s3StatFileKeys.filter(key => key.endsWith('.csv'));

  if (s3StatFileKeys.length === 0) {
    if (VERBOSE) console.log(`[DataAccess-S3] Aggregation: No raw weekly stat files found in S3 path ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/. Nothing to aggregate.`);
    await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, []);
    return { aggregatedActivity: [], overallDataComplete: true }; // Considered complete as there's nothing to process
  }

  for (const repoStatS3Key of s3StatFileKeys) {
    // Read raw weekly stats (CSV) from S3
    try {
      const buf = await readBinaryFile(repoStatS3Key);
      if (!buf) {
        if (VERBOSE) console.warn(`[DataAccess-S3] Aggregation: No data in ${repoStatS3Key}, skipping.`);
        overallDataComplete = false;
        continue;
      }
      const lines = buf.toString('utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const [w,a,d] = line.split(',');
        const weekDate = new Date(Number(w) * 1000);
        if (weekDate > today) continue;
        const weekKey = weekDate.toISOString().split('T')[0];
        if (!weeklyTotals[weekKey]) weeklyTotals[weekKey] = { added: 0, removed: 0 };
        weeklyTotals[weekKey].added += Number(a) || 0;
        weeklyTotals[weekKey].removed += Number(d) || 0;
      }
    } catch (err) {
      if (VERBOSE) console.warn(`[DataAccess-S3] Aggregation: Error reading ${repoStatS3Key}, skipping.`, err);
      overallDataComplete = false;
      continue;
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

