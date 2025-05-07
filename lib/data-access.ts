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

import fs from 'node:fs/promises';
import path from 'node:path';
import { ServerCacheInstance } from '@/lib/server-cache';
import type { UnifiedBookmark, GitHubActivityApiResponse, ContributionDay, GitHubGraphQLContributionResponse, LogoSource, RepoWeeklyStatCache, RepoRawWeeklyStat, AggregatedWeeklyActivity } from '@/types'; // Assuming all types are in @/types
import { LOGO_SOURCES, GENERIC_GLOBE_PATTERNS, LOGO_SIZES } from '@/lib/constants'; // Assuming constants are in @/lib
import { refreshBookmarksData } from '@/lib/bookmarks.client'; // For external bookmark fetching
import { graphql } from '@octokit/graphql'; // For GitHub GraphQL
import * as cheerio from 'cheerio'; // For GitHub scraping fallback
import sharp from 'sharp';
import { createHash } from 'node:crypto';

// --- Configuration & Constants ---
/**
 * The primary GitHub username for whom activity (contributions, repositories contributed to,
 * and lines of code changes) is fetched and processed. This user's activity is tracked
 * across all repositories they have contributed to, regardless of who owns those repositories.
 * Defaults to 'WilliamAGH' if the GITHUB_REPO_OWNER environment variable is not set.
 */
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'WilliamAGH'; // Default fallback if not configured
const GITHUB_API_TOKEN = process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH;
const API_FETCH_TIMEOUT_MS = 30000; // 30 second timeout
const VERBOSE = process.env.VERBOSE === 'true' || false; // Ensure VERBOSE is defined at the module level

// Volume paths
const ROOT_DIR = process.cwd();
const BOOKMARKS_VOLUME_DIR = path.join(ROOT_DIR, 'data', 'bookmarks');
const BOOKMARKS_VOLUME_FILE = path.join(BOOKMARKS_VOLUME_DIR, 'bookmarks.json');
const GITHUB_ACTIVITY_VOLUME_DIR = path.join(ROOT_DIR, 'data', 'github-activity');
const GITHUB_ACTIVITY_VOLUME_FILE = path.join(GITHUB_ACTIVITY_VOLUME_DIR, 'activity_data.json');
const LOGOS_VOLUME_DIR = path.join(ROOT_DIR, 'data', 'images', 'logos'); // Primary logo location

// GitHub Activity Data Paths
const DAILY_CONTRIBUTIONS_FILE = path.join(GITHUB_ACTIVITY_VOLUME_DIR, 'daily_contribution_counts.json');
const REPO_RAW_WEEKLY_STATS_DIR = path.join(GITHUB_ACTIVITY_VOLUME_DIR, 'repo_raw_weekly_stats');
const AGGREGATED_WEEKLY_ACTIVITY_FILE = path.join(GITHUB_ACTIVITY_VOLUME_DIR, 'aggregated_weekly_activity.json');

// Ensure directories exist (run once at startup or on first use)
async function ensureDirectoryExists(dirPath: string) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`[DataAccess] Failed to create directory ${dirPath}:`, error);
    // Depending on severity, you might want to throw or handle differently
  }
}

(async () => {
  await ensureDirectoryExists(BOOKMARKS_VOLUME_DIR);
  await ensureDirectoryExists(GITHUB_ACTIVITY_VOLUME_DIR);
  await ensureDirectoryExists(LOGOS_VOLUME_DIR);
})();


// --- Helper Functions ---

/**
 * Reads data from a JSON file.
 * @param filePath Path to the JSON file.
 * @returns Parsed JSON data or null if an error occurs.
 */
async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const fileContents = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(fileContents) as T;
  } catch (error: any) {
    if (error.code !== 'ENOENT') { // Log errors other than file not found
      console.warn(`[DataAccess] Error reading JSON file ${filePath}:`, error.message);
    }
    return null;
  }
}

/**
 * Writes data to a JSON file atomically.
 * @param filePath Path to the JSON file.
 * @param data Data to write.
 */
async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  const tempFilePath = filePath + '.tmp';
  try {
    const dir = path.dirname(filePath);
    await ensureDirectoryExists(dir);
    const jsonData = JSON.stringify(data, null, 2);
    await fs.writeFile(tempFilePath, jsonData, 'utf-8');
    await fs.rename(tempFilePath, filePath);
  } catch (error) {
    console.error(`[DataAccess] Failed to write JSON file ${filePath}:`, error);
    // Attempt to clean up temp file if it exists
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      // Ignore cleanup error
    }
  }
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
  const metadata = await sharp(buffer).metadata();
  const isSvg = metadata.format === 'svg';
  const contentType = isSvg ? 'image/svg+xml' : 'image/png';
  const processedBuffer = isSvg ? buffer : await sharp(buffer).png().toBuffer();
  return { processedBuffer, isSvg, contentType };
}

/**
 * Reads a binary file (e.g., an image).
 * @param filePath Path to the file.
 * @returns Buffer or null.
 */
async function readBinaryFile(filePath: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(filePath);
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`[DataAccess] Error reading binary file ${filePath}:`, error.message);
    }
    return null;
  }
}

/**
 * Writes a binary file (e.g., an image).
 * @param filePath Path to the file.
 * @param data Buffer to write.
 */
async function writeBinaryFile(filePath: string, data: Buffer): Promise<void> {
  try {
    const dir = path.dirname(filePath);
    await ensureDirectoryExists(dir);
    await fs.writeFile(filePath, data);
  } catch (error) {
    console.error(`[DataAccess] Failed to write binary file ${filePath}:`, error);
  }
}

// --- Bookmarks Data Access ---

/**
 * Fetches bookmarks from the external source.
 * (Simplified from api/bookmarks/route.ts, assuming refreshBookmarksData gets all)
 */
async function fetchExternalBookmarks(): Promise<UnifiedBookmark[] | null> {
  console.log('[DataAccess] Fetching external bookmarks...');
  try {
    const fetchPromise = refreshBookmarksData(); // Assuming this is already hardened
    const timeoutPromise = new Promise<UnifiedBookmark[]>((_, reject) =>
      setTimeout(() => reject(new Error(`Fetch timeout after ${API_FETCH_TIMEOUT_MS}ms for bookmarks`)), API_FETCH_TIMEOUT_MS)
    );
    const bookmarks = await Promise.race([fetchPromise, timeoutPromise]);
    console.log(`[DataAccess] Fetched ${bookmarks.length} bookmarks from external source.`);
    return bookmarks.sort((a, b) => (b.dateBookmarked || "").localeCompare(a.dateBookmarked || ""));
  } catch (error) {
    console.error('[DataAccess] Error fetching external bookmarks:', error);
    return null;
  }
}

export async function getBookmarks(): Promise<UnifiedBookmark[]> {
  // 1. Try Cache
  const cached = ServerCacheInstance.getBookmarks();
  if (cached && cached.bookmarks && cached.bookmarks.length > 0) {
    console.log('[DataAccess] Returning bookmarks from cache.');
    return cached.bookmarks;
  }

  // 2. Try Volume
  const volumeBookmarks = await readJsonFile<UnifiedBookmark[]>(BOOKMARKS_VOLUME_FILE);
  if (volumeBookmarks && volumeBookmarks.length > 0) {
    console.log('[DataAccess] Returning bookmarks from volume.');
    ServerCacheInstance.setBookmarks(volumeBookmarks); // Update cache
    return volumeBookmarks;
  }

  // 3. Fetch from External API
  console.log('[DataAccess] Bookmarks not in cache or volume, fetching from external source.');
  const externalBookmarks = await fetchExternalBookmarks();
  if (externalBookmarks) {
    await writeJsonFile(BOOKMARKS_VOLUME_FILE, externalBookmarks);
    ServerCacheInstance.setBookmarks(externalBookmarks);
    return externalBookmarks;
  }

  console.warn('[DataAccess] Failed to fetch bookmarks from all sources. Returning empty array.');
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
  }
};

function extractNextPageUrl(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  const matches = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return matches ? matches[1] : null;
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
    await new Promise(resolve => setTimeout(resolve, delay));
    delay *= 2;
    retryCount++;
  }
  return lastResponse!;
}

async function fetchAllRepositories(username: string): Promise<any[]> {
  if (!GITHUB_API_TOKEN) {
    console.warn('[DataAccess] GitHub API token is missing for repository fetch.');
    return [];
  }
  let allRepos: any[] = [];
  let nextUrl: string | null = `https://api.github.com/users/${username}/repos?per_page=100`;
  let pagesProcessed = 0;
  while (nextUrl && pagesProcessed < 10) { // Safety limit
    pagesProcessed++;
    try {
      const fetchPromise = fetch(nextUrl, { headers: { 'Authorization': `Bearer ${GITHUB_API_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' } });
      const timeoutPromise = new Promise<Response>((_, reject) => setTimeout(() => reject(new Error(`Timeout fetching repos page ${pagesProcessed}`)), API_FETCH_TIMEOUT_MS));
      const response = await Promise.race([fetchPromise, timeoutPromise]);
      if (!response.ok) break;
      const repos = await response.json();
      allRepos = [...allRepos, ...repos];
      nextUrl = extractNextPageUrl(response.headers.get('Link'));
    } catch (error) {
      console.error(`[DataAccess] Error fetching repositories page ${pagesProcessed}:`, error);
      break;
    }
  }
  return allRepos;
}

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

  // Ensure REPO_RAW_WEEKLY_STATS_DIR exists
  await ensureDirectoryExists(REPO_RAW_WEEKLY_STATS_DIR);

  try {
    const { user } = await graphql<GitHubGraphQLContributionResponse>(`
      query($username: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $username) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks { contributionDays { contributionCount contributionLevel date } }
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

    // Use repositories from the new repositoriesContributedTo field
    const contributedRepoNodes = user.repositoriesContributedTo?.nodes || [];
    const allFetchedRepos = contributedRepoNodes.filter((repo: any) => repo && !repo.isFork);

    const uniqueReposMap = new Map<string, any>();
    for (const repo of allFetchedRepos) {
        if (repo && typeof repo.id === 'string' && repo.id.length > 0) {
            if (!uniqueReposMap.has(repo.id)) {
                uniqueReposMap.set(repo.id, repo);
            }
        } else {
            console.warn(`[DataAccess] fetchExternalGithubActivity: Repository object without a valid string ID or malformed, excluded from deduplication: ${JSON.stringify(repo).substring(0,150)}`);
        }
    }
    const uniqueRepoArray = Array.from(uniqueReposMap.values());

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
        const repoStatFilePath = path.join(REPO_RAW_WEEKLY_STATS_DIR, repoStatFilename);
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
            const existingCache = await readJsonFile<RepoWeeklyStatCache>(repoStatFilePath);
            if (existingCache?.stats) userWeeklyStats = existingCache.stats;

          } else if (statsResponse.ok) {
            const contributors = await statsResponse.json();
            const userStatsEntry = Array.isArray(contributors) ? contributors.find(c => c.author && c.author.login === GITHUB_REPO_OWNER) : null;

            if (userStatsEntry && userStatsEntry.weeks && Array.isArray(userStatsEntry.weeks)) {
              userWeeklyStats = userStatsEntry.weeks.map((w: any) => ({ w: w.w, a: w.a, d: w.d, c: w.c })); // Ensure structure
              apiStatus = userWeeklyStats.length > 0 ? 'complete' : 'empty_no_user_contribs';
            } else {
              if (VERBOSE) console.log(`[DataAccess] No contribution stats for ${GITHUB_REPO_OWNER} in ${repoOwnerLogin}/${repoName} or weeks array is missing/empty.`);
              apiStatus = 'empty_no_user_contribs';
            }
          } else {
             console.warn(`[DataAccess] Error fetching stats for ${repoOwnerLogin}/${repoName}. Status: ${statsResponse.status}. Stats will be incomplete.`);
             currentRepoDataComplete = false;
             // Try to load existing data if API failed
             const existingCache = await readJsonFile<RepoWeeklyStatCache>(repoStatFilePath);
             if (existingCache?.stats) userWeeklyStats = existingCache.stats;
          }

          // Incremental update logic for the raw weekly stats file
          let finalStatsToSave: RepoRawWeeklyStat[] = [];
          const existingRepoData = await readJsonFile<RepoWeeklyStatCache>(repoStatFilePath);

          if (existingRepoData && existingRepoData.stats && apiStatus !== 'pending_202_from_api' && statsResponse.ok) { // Only merge if new data is good
            const existingStatsMap = new Map(existingRepoData.stats.map(s => [s.w, s]));
            userWeeklyStats.forEach(newWeek => {
              existingStatsMap.set(newWeek.w, newWeek); // Add or overwrite with new data
            });
            finalStatsToSave = Array.from(existingStatsMap.values()).sort((a,b) => a.w - b.w);
          } else if (userWeeklyStats.length > 0) { // Use newly fetched if no existing or if API was problematic but gave some data
            finalStatsToSave = userWeeklyStats.sort((a,b) => a.w - b.w);
          } else if (existingRepoData?.stats) { // Fallback to existing if API fetch failed entirely and we have old data
            finalStatsToSave = existingRepoData.stats.sort((a,b) => a.w - b.w);
          }
          // if finalStatsToSave is still empty, it means no data ever, or API errors and no cache.

          const newCacheEntry: RepoWeeklyStatCache = {
            repoOwnerLogin,
            repoName,
            lastFetched: new Date().toISOString(),
            status: apiStatus, // Reflects the latest attempt
            stats: finalStatsToSave,
          };
          await writeJsonFile(repoStatFilePath, newCacheEntry);
          if (VERBOSE && (apiStatus === 'complete' || apiStatus === 'empty_no_user_contribs')) console.log(`[DataAccess] Raw weekly stats for ${repoOwnerLogin}/${repoName} saved/updated to ${repoStatFilename}. Status: ${apiStatus}, Weeks: ${finalStatsToSave.length}`);

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

        } catch (repoError) {
          console.warn(`[DataAccess] Critical error processing stats for ${repoOwnerLogin}/${repoName}:`, repoError);
          currentRepoDataComplete = false;
          // Attempt to write a cache entry indicating error, preserving old stats if any
          try {
            const existingRepoDataOnError = await readJsonFile<RepoWeeklyStatCache>(repoStatFilePath);
            const errorCacheEntry: RepoWeeklyStatCache = {
              repoOwnerLogin,
              repoName,
              lastFetched: new Date().toISOString(),
              status: 'fetch_error',
              stats: existingRepoDataOnError?.stats || [], // Preserve old stats on error
            };
            await writeJsonFile(repoStatFilePath, errorCacheEntry);
          } catch (writeError) {
            console.error(`[DataAccess] Failed to write error state for ${repoStatFilename}:`, writeError);
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
      level: mapContributionLevel(d.contributionLevel) as 0 | 1 | 2 | 3 | 4
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
      const summaryFilePath = path.join(GITHUB_ACTIVITY_VOLUME_DIR, 'github_stats_summary.json');
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
      await writeJsonFile(summaryFilePath, summaryData);
      if (VERBOSE) console.log(`[DataAccess] GitHub activity summary saved to ${summaryFilePath}`);
    } catch (summaryError) {
      console.error('[DataAccess] Failed to write GitHub activity summary file:', summaryError);
      // Do not fail the main operation if only summary writing fails
    }

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
      if (countMatch) count = countMatch[1] === 'No' ? 0 : parseInt(countMatch[1], 10);
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

  // 2. Try Volume
  const volumeActivity = await readJsonFile<GitHubActivityApiResponse>(GITHUB_ACTIVITY_VOLUME_FILE);
  if (volumeActivity && volumeActivity.data && volumeActivity.data.length > 0 && volumeActivity.dataComplete) {
    console.log('[DataAccess] Returning GitHub activity from volume.');
    ServerCacheInstance.setGithubActivity(volumeActivity); // Update cache
    return volumeActivity;
  }

  // 3. Fetch from External API
  console.log('[DataAccess] GitHub activity not in cache or volume (or incomplete), fetching from external source.');
  const externalActivity = await fetchExternalGithubActivity();
  if (externalActivity) {
    await writeJsonFile(GITHUB_ACTIVITY_VOLUME_FILE, externalActivity);
    ServerCacheInstance.setGithubActivity(externalActivity);
    return externalActivity;
  }

  // If external fetch failed, but we have incomplete data in volume or cache, return that.
  if (volumeActivity && volumeActivity.data && volumeActivity.data.length > 0) {
    console.warn('[DataAccess] External GitHub fetch failed, returning incomplete data from volume.');
    ServerCacheInstance.setGithubActivity(volumeActivity);
    return volumeActivity;
  }
  if (cached && cached.data && cached.data.length > 0) {
    console.warn('[DataAccess] External GitHub fetch failed, returning incomplete data from cache.');
    return cached;
  }

  console.warn('[DataAccess] Failed to fetch GitHub activity from all sources.');
  return null;
}


// --- Logo Data Access ---
// (Re-using and adapting logic from app/api/logo/route.ts)

function getDomainHash(domain: string): string {
  return createHash('md5').update(domain).digest('hex');
}

function getLogoVolumePath(domain: string, source: LogoSource): string {
  const hash = getDomainHash(domain).substring(0, 8);
  const id = domain.split('.')[0];
  const sourceAbbr = source === 'duckduckgo' ? 'ddg' : source;
  return path.join(LOGOS_VOLUME_DIR, `${id}_${hash}_${sourceAbbr}.png`);
}

async function findLogoInVolume(domain: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
  for (const source of ['google', 'clearbit', 'duckduckgo'] as LogoSource[]) {
    const logoPath = getLogoVolumePath(domain, source);
    const buffer = await readBinaryFile(logoPath);
    if (buffer) {
      console.log(`[DataAccess] Found logo for ${domain} from source ${source} in volume.`);
      return { buffer, source };
    }
  }
  // Fallback: search for any file starting with domain ID in LOGOS_VOLUME_DIR
  // This is to support older naming conventions or if source is unknown.
  try {
    const files = await fs.readdir(LOGOS_VOLUME_DIR);
    const id = domain.split('.')[0];
    const matchingFile = files.find(file => file.startsWith(`${id}_`));
    if (matchingFile) {
        const buffer = await readBinaryFile(path.join(LOGOS_VOLUME_DIR, matchingFile));
        if (buffer) {
            // Try to infer source from filename, default to 'unknown'
            let inferredSource: LogoSource = 'unknown';
            if (matchingFile.includes('_google')) inferredSource = 'google';
            else if (matchingFile.includes('_clearbit')) inferredSource = 'clearbit';
            else if (matchingFile.includes('_ddg')) inferredSource = 'duckduckgo';
            console.log(`[DataAccess] Found logo for ${domain} by pattern match in volume: ${matchingFile}`);
            return { buffer, source: inferredSource };
        }
    }
  } catch (e) { /* ignore if readdir fails */ }
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

async function fetchExternalLogo(domain: string, baseUrlForValidation: string): Promise<{ buffer: Buffer; source: LogoSource } | null> {
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
      const response = await fetch(url, { signal: controller.signal, headers: {'User-Agent': 'Mozilla/5.0'} });
      clearTimeout(timeoutId);

      if (!response.ok) continue;
      const rawBuffer = Buffer.from(await response.arrayBuffer());
      if (!rawBuffer || rawBuffer.byteLength < 100) continue; // Skip tiny/error images

      if (await validateLogoBuffer(rawBuffer, url)) {
        const { processedBuffer } = await processImageBuffer(rawBuffer);
        console.log(`[DataAccess] Fetched logo for ${domain} from ${name}.`);
        return { buffer: processedBuffer, source: name };
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.warn(`[DataAccess] Error fetching logo for ${domain} from ${name} (${url}):`, error.message);
      }
    }
  }
  return null;
}


export async function getLogo(domain: string, baseUrlForValidation: string): Promise<{ buffer: Buffer; source: LogoSource; contentType: string } | null> {
  // 1. Try Cache
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached && cached.buffer) {
    console.log(`[DataAccess] Returning logo for ${domain} from cache (source: ${cached.source || 'unknown'}).`);
    const { contentType } = await processImageBuffer(cached.buffer);
    return { buffer: cached.buffer, source: cached.source || 'unknown', contentType };
  }

  // 2. Try Volume
  const volumeLogo = await findLogoInVolume(domain);
  if (volumeLogo) {
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: volumeLogo.source, buffer: volumeLogo.buffer });
    const { contentType } = await processImageBuffer(volumeLogo.buffer);
    return { ...volumeLogo, contentType };
  }

  // 3. Fetch from External API
  console.log(`[DataAccess] Logo for ${domain} not in cache or volume, fetching from external source.`);
  const externalLogo = await fetchExternalLogo(domain, baseUrlForValidation);
  if (externalLogo) {
    const logoPath = getLogoVolumePath(domain, externalLogo.source);
    await writeBinaryFile(logoPath, externalLogo.buffer);
    ServerCacheInstance.setLogoFetch(domain, { url: null, source: externalLogo.source, buffer: externalLogo.buffer });
    const { contentType } = await processImageBuffer(externalLogo.buffer);
    return { ...externalLogo, contentType };
  }

  console.warn(`[DataAccess] Failed to fetch logo for ${domain} from all sources.`);
  // Cache failure to avoid retrying too often
  ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: 'Failed to fetch logo' });
  return null;
}

// --- Investment Data for Logo Domains ---
// This function is specific to populate-volumes.js needs and might be better placed there
// or refactored if investments.ts becomes JSON.
// Import investments statically to avoid critical dependency warning
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
          } catch (e) { /* ignore invalid URLs */ }
        }
      }
      console.log(`[DataAccess] Successfully parsed ${domainToIdMap.size} investment domains via static import.`);
      return domainToIdMap;
    }
  } catch (importError) {
    console.warn(`[DataAccess] Could not use static import of investments.ts, falling back to regex parsing: ${importError}`);

    // Fallback to regex parsing if static import fails
    const investmentsPath = path.join(ROOT_DIR, 'data', 'investments.ts');
      // Fallback to regex parsing if direct import fails (e.g. in a pure Node script without TS compilation)
      try {
        const investmentsContent = await fs.readFile(investmentsPath, 'utf-8');
        // Regex logic from populate-volumes.js (simplified for brevity, ensure it's robust)
        let currentId: string | null = null;
        const investmentBlocks = investmentsContent.split(/^\s*{\s*(?:"|')id(?:"|'):/m);

        for (let i = 1; i < investmentBlocks.length; i++) {
            const block = investmentBlocks[i];
            const idMatch = block.match(/^(?:"|')([^"']+)(?:"|')/);
            if (idMatch) {
                currentId = idMatch[1];
                const urlPatterns = [
                    /website:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g,
                    /url:\s*['"](?:https?:\/\/)?(?:www\.)?([^\/'"]+)['"]/g,
                ];
                for (const pattern of urlPatterns) {
                    let urlMatch;
                    while ((urlMatch = pattern.exec(block)) !== null) {
                        if (urlMatch[1]) {
                            const domain = urlMatch[1];
                            domainToIdMap.set(domain, currentId);
                        }
                    }
                }
            }
        }
        console.log(`[DataAccess] Successfully parsed ${domainToIdMap.size} investment domains via regex.`);
      } catch (regexParseError) {
          console.error('[DataAccess] Failed to parse investment domains via regex:', regexParseError);
      }
  }
  return domainToIdMap;
}

// Type definitions moved to types/github.ts

export async function calculateAndStoreAggregatedWeeklyActivity(): Promise<{ aggregatedActivity: AggregatedWeeklyActivity[], overallDataComplete: boolean } | null> {
  console.log('[DataAccess] Calculating aggregated weekly activity...');
  // Ensure the source directory exists before trying to read from it
  try {
    await fs.mkdir(REPO_RAW_WEEKLY_STATS_DIR, { recursive: true });
  } catch (mkdirError) {
    console.error(`[DataAccess] Aggregation: Critical error creating directory ${REPO_RAW_WEEKLY_STATS_DIR}:`, mkdirError);
    return null; // Cannot proceed if directory cannot be ensured
  }

  let overallDataComplete = true;
  const weeklyTotals: { [weekStart: string]: { added: number; removed: number } } = {};

  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setDate(today.getDate() - 365);

  let statFiles: string[];
  try {
    statFiles = await fs.readdir(REPO_RAW_WEEKLY_STATS_DIR);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      // If the directory itself doesn't exist after trying to create it, it's an issue, but less critical if we just created it.
      // More likely, it's empty.
      if (VERBOSE) console.log(`[DataAccess] Aggregation: Directory ${REPO_RAW_WEEKLY_STATS_DIR} is empty or was just created. No files to aggregate yet.`);
      // Write an empty aggregation file to signify the process ran but found nothing
      await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_FILE, []);
      return { aggregatedActivity: [], overallDataComplete: true };
    } else {
      console.error(`[DataAccess] Aggregation: Error reading directory ${REPO_RAW_WEEKLY_STATS_DIR}:`, err);
      return null; // Indicate a more serious error occurred
    }
  }

  if (statFiles.length === 0) {
    if (VERBOSE) console.log(`[DataAccess] Aggregation: No raw weekly stat files found in ${REPO_RAW_WEEKLY_STATS_DIR}. Nothing to aggregate.`);
    await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_FILE, []); // Write empty if no files
    return { aggregatedActivity: [], overallDataComplete: true };
  }

  for (const repoStatFilename of statFiles) {
    if (!repoStatFilename.endsWith('.json')) {
        if (VERBOSE) console.log(`[DataAccess] Aggregation: Skipping non-JSON file ${repoStatFilename} in ${REPO_RAW_WEEKLY_STATS_DIR}`);
        continue;
    }

    const repoStatFilePath = path.join(REPO_RAW_WEEKLY_STATS_DIR, repoStatFilename);
    const repoData = await readJsonFile<RepoWeeklyStatCache>(repoStatFilePath);

    if (!repoData) {
        if (VERBOSE) console.warn(`[DataAccess] Aggregation: Could not read or parse ${repoStatFilePath}, skipping.`);
        overallDataComplete = false; // If a file can't be read, data might be incomplete
        continue;
    }

    if (repoData.status !== 'complete' && repoData.status !== 'empty_no_user_contribs') {
      if (repoData.status === 'pending_202_from_api' || repoData.status === 'fetch_error') {
        overallDataComplete = false;
        if (VERBOSE) console.log(`[DataAccess] Aggregation: Repo ${repoStatFilename} data is status '${repoData.status}', marking overall as incomplete.`);
      }
      // Only skip if the status is not 'complete' or 'empty_no_user_contribs'
      if (repoData.status === 'pending_202_from_api' || repoData.status === 'fetch_error') {
         if (VERBOSE) console.log(`[DataAccess] Aggregation: Skipping repo ${repoStatFilename} due to status: ${repoData.status}.`);
        continue;
      }
    }

    if (repoData.stats && repoData.stats.length > 0) {
      for (const week of repoData.stats) {
        const weekStartDate = new Date(week.w * 1000);
        // Only include weeks within the last year for this aggregation
        if (weekStartDate >= oneYearAgo && weekStartDate <= today) {
          const weekKey = weekStartDate.toISOString().split('T')[0];
          if (!weeklyTotals[weekKey]) {
            weeklyTotals[weekKey] = { added: 0, removed: 0 };
          }
          weeklyTotals[weekKey].added += week.a || 0; // Ensure undefined is treated as 0
          weeklyTotals[weekKey].removed += week.d || 0; // Ensure undefined is treated as 0
        }
      }
    } else if (VERBOSE && repoData.status === 'complete') {
        // This case means status is 'complete' but stats array is empty or null.
        console.log(`[DataAccess] Aggregation: Repo ${repoStatFilename} has 'complete' status but no stats data to process.`);
    }
  }

  if (VERBOSE) console.log(`[DataAccess] Aggregation: Processed ${statFiles.filter(f => f.endsWith('.json')).length} potential JSON files from ${REPO_RAW_WEEKLY_STATS_DIR}.`);

  const aggregatedActivity: AggregatedWeeklyActivity[] = Object.entries(weeklyTotals)
    .map(([weekStartDate, totals]) => ({
      weekStartDate,
      linesAdded: totals.added,
      linesRemoved: totals.removed,
    }))
    .sort((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());

  await writeJsonFile(AGGREGATED_WEEKLY_ACTIVITY_FILE, aggregatedActivity);
  console.log(`[DataAccess] Aggregated weekly activity calculated and stored to ${AGGREGATED_WEEKLY_ACTIVITY_FILE}. Total weeks aggregated: ${aggregatedActivity.length}. Overall data complete: ${overallDataComplete}`);
  return { aggregatedActivity, overallDataComplete };
}
