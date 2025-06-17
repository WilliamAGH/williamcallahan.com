/**
 * GitHub Data Access Module
 *
 * Handles fetching, processing, and caching of GitHub activity data
 * Includes contributions, repository statistics, commit history, and lines of code metrics
 * Access pattern: In-memory Cache → S3 Storage → GitHub API (GraphQL and REST)
 *
 * @module data-access/github
 */

import {
  getS3ObjectMetadata,
  readBinaryS3,
  readJsonS3,
  listS3Objects as s3UtilsListS3Objects,
  writeBinaryS3,
  writeJsonS3,
} from "@/lib/s3-utils";
import { ServerCacheInstance } from "@/lib/server-cache";
import { debug } from "@/lib/utils/debug";
import type {
  AggregatedWeeklyActivity,
  ContributionDay,
  GitHubActivityApiResponse,
  GitHubActivitySegment,
  GitHubActivitySummary,
  GitHubGraphQLContributionResponse,
  GithubContributorStatsEntry,
  GraphQLUserContributionsResponse,
  RepoRawWeeklyStat,
  RepoWeeklyStatCache,
  StoredGithubActivityS3,
  UserActivityView,
} from "@/types"; // Assuming all GitHub related types are in '@/types' or '@/types/github'
import { graphql } from "@octokit/graphql";

// --- Configuration & Constants ---
/**
 * GitHub username for fetching activity data across all contributed repositories.
 * Defaults to 'WilliamAGH' if GITHUB_REPO_OWNER is not set
 */
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || "WilliamAGH";
const GITHUB_API_TOKEN = process.env.GITHUB_ACCESS_TOKEN_COMMIT_GRAPH;

// Volume paths / S3 Object Keys for GitHub data (environment-aware)
export const GITHUB_ACTIVITY_S3_KEY_DIR = "github-activity";

// Determine suffix based on runtime env so dev/test never overwrite prod data
const ghEnvSuffix = (() => {
  const env = process.env.NODE_ENV;
  if (env === "production" || !env) return ""; // prod keeps canonical names
  if (env === "test") return "-test";
  return "-dev"; // treat everything else as development-like
})();

export const GITHUB_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/activity_data${ghEnvSuffix}.json`;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary${ghEnvSuffix}.json`;
export const ALL_TIME_SUMMARY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/github_stats_summary_all_time${ghEnvSuffix}.json`;

// GitHub Activity Data Paths / S3 Object Keys
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = `${GITHUB_ACTIVITY_S3_KEY_DIR}/repo_raw_weekly_stats${ghEnvSuffix}`;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = `${GITHUB_ACTIVITY_S3_KEY_DIR}/aggregated_weekly_activity${ghEnvSuffix}.json`;

const CONCURRENT_REPO_LIMIT = 5; // Limit for concurrent repository processing

// --- Helper Functions ---

/**
 * Formats trailing year and all-time GitHub activity data into a structured API response
 *
 * @param fetchedParts - Contains the trailing year and all-time activity data to be wrapped
 * @returns A structured API response with separated trailing year and all-time segments, or `null` if input is missing or incomplete
 */
function wrapGithubActivity(
  fetchedParts: {
    trailingYearData: StoredGithubActivityS3;
    allTimeData: StoredGithubActivityS3;
  } | null,
): GitHubActivityApiResponse | null {
  if (!fetchedParts || !fetchedParts.trailingYearData || !fetchedParts.allTimeData) {
    console.warn("[DataAccess/GitHub] wrapGithubActivity received null or incomplete parts");
    return null;
  }
  // Create segments by spreading. 'summaryActivity' and 'allTimeTotalContributions' are omitted by type.
  const trailingYearSegment: GitHubActivitySegment = { ...fetchedParts.trailingYearData };
  const cumulativeAllTimeSegment: GitHubActivitySegment = { ...fetchedParts.allTimeData };

  return {
    trailingYearData: trailingYearSegment,
    cumulativeAllTimeData: cumulativeAllTimeSegment,
  };
}

/**
 * Converts a GitHub GraphQL contribution level string to its numeric equivalent.
 *
 * @param graphQLLevel - The contribution level string from the GitHub GraphQL API.
 * @returns A numeric value from 0 (none) to 4 (fourth quartile) representing the contribution level
 *
 * @remark Returns 0 if {@link graphQLLevel} is unrecognized
 */
function mapGraphQLContributionLevelToNumeric(graphQLLevel: string): 0 | 1 | 2 | 3 | 4 {
  switch (graphQLLevel) {
    case "NONE":
      return 0;
    case "FIRST_QUARTILE":
      return 1;
    case "SECOND_QUARTILE":
      return 2;
    case "THIRD_QUARTILE":
      return 3;
    case "FOURTH_QUARTILE":
      return 4;
    default:
      return 0; // Default to 0 for any unexpected values
  }
}

/**
 * Fetches a URL with retries for network errors and GitHub API 202 (Accepted) responses using exponential backoff with jitter
 *
 * Handles both network-level errors and application-level retries for 202 status
 * Implements exponential backoff with jitter to prevent thundering herd problems
 *
 * @param url - The URL to fetch
 * @param options - Fetch request options
 * @param maxRetries - Maximum number of retries before giving up. Defaults to 5
 * @returns The final Response object, which may still have a 202 status if all retries are exhausted
 * @throws {Error} If all retries fail without receiving any response, or if max retries are exhausted
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 5,
): Promise<Response> {
  let lastResponse: Response | null = null;
  let retryCount = 0;
  let baseDelay = 1000; // Initial delay in ms

  const getJitteredDelay = () => {
    const jitter = Math.random() * 1 - 0.5; // ±50% jitter
    const delay = baseDelay * (1 + jitter);
    return Math.min(delay, 30000); // Cap at 30 seconds
  };

  while (retryCount < maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30s hard timeout

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Success case - return immediately for non-202 responses
      if (response.status !== 202) {
        return response;
      }

      // Handle 202 Accepted with retry
      const retryAfter = response.headers.get("Retry-After");
      const delay = retryAfter ? Number.parseInt(retryAfter, 10) * 1000 : getJitteredDelay();

      console.log(
        `[DataAccess/GitHub] GitHub API returned 202 for ${url}, waiting ${delay}ms before retry ${retryCount + 1}/${maxRetries}`,
      );
      lastResponse = response;

      await new Promise((resolve) => setTimeout(resolve, delay));
      baseDelay *= 2; // Exponential backoff for next retry
      retryCount++;
    } catch (error) {
      clearTimeout(timeout);

      // Handle network errors (DNS, connection refused, etc.)
      if (retryCount === maxRetries - 1) {
        console.error(
          `[DataAccess/GitHub] Network error on final retry (${retryCount + 1}/${maxRetries}) for ${url}:`,
          error,
        );
        throw error; // Re-throw on final retry
      }

      const delay = getJitteredDelay();
      console.warn(
        `[DataAccess/GitHub] Network error on attempt ${retryCount + 1}/${maxRetries} for ${url}, retrying in ${delay}ms:`,
        error,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      baseDelay *= 2; // Exponential backoff for next retry
      retryCount++;
    }
  }

  // This should only be reached if we exhausted all retries on 202s
  if (!lastResponse) {
    // This case should be unreachable due to the error handling above
    throw new Error(`All ${maxRetries} retries failed for ${url} without a valid response.`);
  }

  // If we got here, we have a lastResponse (from 202s) to return
  // The caller is expected to handle this (e.g., by treating it as data still pending)
  return lastResponse;
}

/**
 * Determines if the given object matches the old flat StoredGithubActivityS3 format
 *
 * @param obj - The object to evaluate
 * @returns True if obj has a data array and numeric totalContributions property, indicating the old flat format; otherwise, false
 */

function isOldFlatStoredGithubActivityS3Format(obj: unknown): obj is StoredGithubActivityS3 {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }
  // Check for key properties of StoredGithubActivityS3 that are not in GitHubActivityApiResponse
  const record = obj as Record<string, unknown>;
  return Array.isArray(record.data) && typeof record.totalContributions === "number";
}

// --- GitHub Activity Data Refresh ---

/**
 * Refreshes and recalculates GitHub activity data by fetching repository statistics, commit history, and contribution calendars from the GitHub API, then updates S3 storage with the latest summaries and per-repository data.
 *
 * This function:
 * - Optionally repairs CSV files for data completeness.
 * - Fetches all non-forked repositories contributed to by the configured user.
 * - For each repository, retrieves weekly contributor statistics and falls back to S3 data if necessary.
 * - Aggregates lines of code added/removed and commit counts for both the trailing year and all-time.
 * - Fetches the user's contribution calendar for the trailing year.
 * - Writes updated CSVs, summary JSON files, and combined activity data to S3.
 * - Performs consistency checks between trailing year and all-time statistics.
 * - Triggers aggregation of weekly activity across all repositories.
 *
 * @returns A promise that resolves to an object containing `trailingYearData` and `allTimeData`, or `null` if the refresh fails
 */
export async function refreshGitHubActivityDataFromApi(): Promise<{
  trailingYearData: StoredGithubActivityS3;
  allTimeData: StoredGithubActivityS3;
} | null> {
  console.log(
    "[DataAccess/GitHub:refreshGitHubActivity] Attempting to refresh GitHub activity data from API...",
  );
  if (!GITHUB_API_TOKEN) {
    console.warn("[DataAccess/GitHub] GitHub API token is missing. Cannot fetch GitHub activity.");
    return null;
  }

  console.log(
    `[DataAccess/GitHub] Initiating GitHub activity refresh from API for ${GITHUB_REPO_OWNER}...`,
  );

  if (process.env.AUTO_REPAIR_CSV_FILES !== "false") {
    console.log(
      "[DataAccess/GitHub] Running CSV repair before data refresh to ensure complete data",
    );
    try {
      await detectAndRepairCsvFiles();
    } catch (repairError) {
      console.warn(
        "[DataAccess/GitHub] CSV repair before refresh failed but continuing with refresh:",
        repairError,
      );
    }
  }
  const now = new Date();
  type GithubRepoNode = NonNullable<
    NonNullable<GitHubGraphQLContributionResponse["user"]>["repositoriesContributedTo"]
  >["nodes"][number];
  let uniqueRepoArray: GithubRepoNode[];
  let githubUserId: string | undefined; // Declare githubUserId
  try {
    console.log(
      `[DataAccess/GitHub] Fetching list of contributed repositories and user ID for ${GITHUB_REPO_OWNER} via GraphQL API...`,
    );
    const { user } = await graphql<GitHubGraphQLContributionResponse>(
      `
      query($username: String!) {
        user(login: $username) {
          id # <-- ADDED USER ID FETCH
          repositoriesContributedTo(
            first: 100,
            contributionTypes: [COMMIT],
            includeUserRepositories: true,
            orderBy: { field: PUSHED_AT, direction: DESC }
          ) {
            nodes { id name owner { login } nameWithOwner isFork isPrivate }
          }
        }
      }
    `,
      { username: GITHUB_REPO_OWNER, headers: { authorization: `bearer ${GITHUB_API_TOKEN}` } },
    );

    githubUserId = user?.id;
    if (!githubUserId) {
      // Early return if user ID is missing - this is critical for using GraphQL to count commits
      // Without a user ID, we can't use the more efficient GraphQL commit counting method
      // and would need to fall back to REST API pagination which can hit rate limits
      console.error(
        "[DataAccess/GitHub] CRITICAL: Failed to fetch user ID for GITHUB_REPO_OWNER. Cannot proceed with accurate commit counting.",
      );
      return null;
    }

    const contributedRepoNodes = user?.repositoriesContributedTo?.nodes || [];
    uniqueRepoArray = contributedRepoNodes.filter(
      (repo): repo is GithubRepoNode => !!(repo && !repo.isFork),
    );
  } catch (gqlError: unknown) {
    console.error(
      "[DataAccess/GitHub] CRITICAL: Failed to fetch repository list via GraphQL:",
      gqlError instanceof Error ? gqlError.message : String(gqlError),
    );
    return null;
  }

  if (uniqueRepoArray.length === 0) {
    console.warn("[DataAccess/GitHub] No non-forked repositories contributed to found for user.");
    const emptyRawResponse: StoredGithubActivityS3 = {
      source: "api",
      data: [],
      totalContributions: 0,
      linesAdded: 0,
      linesRemoved: 0,
      dataComplete: true,
      allTimeTotalContributions: 0,
    };
    const result = { trailingYearData: emptyRawResponse, allTimeData: emptyRawResponse };
    await writeJsonS3(GITHUB_ACTIVITY_S3_KEY_FILE, wrapGithubActivity(result));
    return result;
  }

  console.log("[DataAccess/GitHub] Calculating trailing year stats...");
  const trailingYearFromDate = new Date(now);
  trailingYearFromDate.setDate(now.getDate() - 365);
  // Ensure 'from' date is set to the beginning of the day for GraphQL query
  const gqlFromDate = new Date(trailingYearFromDate);
  gqlFromDate.setUTCHours(0, 0, 0, 0);

  // Ensure 'to' date for GraphQL is set to the end of 'now' day to include all of today's contributions
  const gqlToDate = new Date(now);
  gqlToDate.setUTCHours(23, 59, 59, 999);

  let yearLinesAdded = 0;
  let yearLinesRemoved = 0;
  const yearCategoryStats: GitHubActivitySummary["linesOfCodeByCategory"] = {
    frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
  };

  // Initialize accumulators for all-time stats (calculated in-memory)
  let allTimeLinesAdded = 0;
  let allTimeLinesRemoved = 0;
  let allTimeTotalCommits = 0;
  let allTimeOverallDataComplete = true; // Assume complete until proven otherwise
  const allTimeCategoryStats: GitHubActivitySummary["linesOfCodeByCategory"] = {
    frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
  };

  for (let i = 0; i < uniqueRepoArray.length; i += CONCURRENT_REPO_LIMIT) {
    const batch = uniqueRepoArray.slice(i, i + CONCURRENT_REPO_LIMIT);
    const batchPromises = batch.map(async (repo) => {
      const repoOwnerLogin = repo.owner.login;
      const repoName = repo.name;
      const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwnerLogin}_${repoName}.csv`;
      let currentRepoLinesAdded365 = 0;
      let currentRepoLinesRemoved365 = 0;
      let repoDataCompleteForYear = true; // This flag is mostly for trailing year consistency
      let currentRepoAllTimeLinesAdded = 0;
      let currentRepoAllTimeLinesRemoved = 0;
      let thisRepoAllTimeDataContributed = false;

      let apiStatus: RepoWeeklyStatCache["status"] = "fetch_error";
      let finalStatsToSaveForRepo: RepoRawWeeklyStat[] = [];
      try {
        const statsResponse = await fetchWithRetry(
          `https://api.github.com/repos/${repoOwnerLogin}/${repoName}/stats/contributors`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_API_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );
        let userWeeklyStatsFromApi: RepoRawWeeklyStat[] = [];
        if (statsResponse.status === 202) {
          apiStatus = "pending_202_from_api";
          repoDataCompleteForYear = false;
          debug(
            `[DataAccess/GitHub] Trailing Year: GitHub API returned 202 (pending) for ${repoOwnerLogin}/${repoName}.`,
          );
        } else if (statsResponse.ok) {
          const contributors = (await statsResponse.json()) as GithubContributorStatsEntry[];
          const ownerLoginLower = GITHUB_REPO_OWNER.toLowerCase();
          const userStatsEntry = Array.isArray(contributors)
            ? contributors.find((c) => c?.author?.login.toLowerCase() === ownerLoginLower)
            : null;
          if (userStatsEntry?.weeks && Array.isArray(userStatsEntry.weeks)) {
            userWeeklyStatsFromApi = userStatsEntry.weeks.map((w: RepoRawWeeklyStat) => ({
              w: w.w,
              a: w.a,
              d: w.d,
              c: w.c,
            }));
            apiStatus = userWeeklyStatsFromApi.length > 0 ? "complete" : "empty_no_user_contribs";
          } else {
            apiStatus = "empty_no_user_contribs";
          }
        } else {
          repoDataCompleteForYear = false;
          debug(
            `[DataAccess/GitHub] Trailing Year: Error fetching stats for ${repoOwnerLogin}/${repoName}. Status: ${statsResponse.status}.`,
          );
        }
        if (apiStatus === "complete" && userWeeklyStatsFromApi.length > 0) {
          finalStatsToSaveForRepo = userWeeklyStatsFromApi.sort((a, b) => a.w - b.w);
        } else {
          const existingDataBuffer = await readBinaryS3(repoStatS3Key);
          if (existingDataBuffer && existingDataBuffer.length > 0) {
            debug(
              `[DataAccess/GitHub-S3] Trailing Year: Using existing S3 CSV data for ${repoOwnerLogin}/${repoName} due to API status: ${apiStatus}`,
            );
            finalStatsToSaveForRepo = existingDataBuffer
              .toString()
              .split("\n")
              .filter(Boolean)
              .map((line) => {
                const [w, a, d, c] = line.split(",");
                return { w: Number(w), a: Number(a), d: Number(d), c: Number(c) };
              });
          } else {
            if (apiStatus === "pending_202_from_api" || apiStatus === "fetch_error") {
              repoDataCompleteForYear = false;

              if (!repoDataCompleteForYear) {
                allTimeOverallDataComplete = false;
              }
            }
          }
        }
        if (
          finalStatsToSaveForRepo.length > 0 &&
          (apiStatus === "complete" ||
            apiStatus === "empty_no_user_contribs" ||
            (apiStatus !== "fetch_error" &&
              apiStatus !== "pending_202_from_api" &&
              finalStatsToSaveForRepo.length > 0))
        ) {
          await writeBinaryS3(
            repoStatS3Key,
            Buffer.from(
              finalStatsToSaveForRepo.map((w) => `${w.w},${w.a},${w.d},${w.c}`).join("\n"),
            ),
            "text/csv",
          );
          debug(
            `[DataAccess/GitHub-S3] Trailing Year: CSV for ${repoOwnerLogin}/${repoName} updated/written. Weeks: ${finalStatsToSaveForRepo.length}. API Status: ${apiStatus}`,
          );
        } else if (
          finalStatsToSaveForRepo.length === 0 &&
          (apiStatus === "pending_202_from_api" || apiStatus === "fetch_error")
        ) {
          console.warn(
            `[DataAccess/GitHub-S3] Trailing Year: No stats data to save for ${repoOwnerLogin}/${repoName} (API status: ${apiStatus}, no usable existing S3 data). CSV not written.`,
          );
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
        console.warn(
          `[DataAccess/GitHub] Trailing Year: Critical error processing stats for ${repoOwnerLogin}/${repoName}:`,
          repoError instanceof Error ? repoError.message : String(repoError),
        );
        repoDataCompleteForYear = false;
        allTimeOverallDataComplete = false; // If trailing year fails for a repo, all-time is also affected for this source
      }
      yearLinesAdded += currentRepoLinesAdded365;
      yearLinesRemoved += currentRepoLinesRemoved365;

      // Accumulate all-time stats from finalStatsToSaveForRepo (which contains all historical data for the repo)
      if (finalStatsToSaveForRepo.length > 0) {
        thisRepoAllTimeDataContributed = true; // Mark that this repo contributed some data
        for (const week of finalStatsToSaveForRepo) {
          currentRepoAllTimeLinesAdded += week.a || 0;
          currentRepoAllTimeLinesRemoved += week.d || 0;
        }
      } else if (apiStatus === "fetch_error" || apiStatus === "pending_202_from_api") {
        // If fetching failed or is pending, and there was no S3 fallback with data,
        // then all-time data for this repo is incomplete.
        allTimeOverallDataComplete = false;
      }
      // If apiStatus is 'empty_no_user_contribs' and finalStatsToSaveForRepo is empty,
      // it means the API confirmed no contributions, so it's "complete" in that sense.

      allTimeLinesAdded += currentRepoAllTimeLinesAdded;
      allTimeLinesRemoved += currentRepoAllTimeLinesRemoved;
      // allTimeTotalCommits is now calculated later using a more accurate method

      const repoNameLower = repo.name.toLowerCase();
      let categoryKey: keyof typeof yearCategoryStats = "other"; // Same key for year and all-time categories
      if (repoNameLower.includes("front")) categoryKey = "frontend";
      else if (repoNameLower.includes("back")) categoryKey = "backend";
      else if (repoNameLower.includes("data") || repoNameLower.includes("scraping"))
        categoryKey = "dataEngineer";

      if (
        currentRepoLinesAdded365 > 0 ||
        currentRepoLinesRemoved365 > 0 ||
        repoDataCompleteForYear
      ) {
        yearCategoryStats[categoryKey].linesAdded += currentRepoLinesAdded365;
        yearCategoryStats[categoryKey].linesRemoved += currentRepoLinesRemoved365;
        yearCategoryStats[categoryKey].repoCount += 1; // Count repo for trailing year if it has activity or is "complete"
        yearCategoryStats[categoryKey].netChange =
          (yearCategoryStats[categoryKey].netChange || 0) +
          (currentRepoLinesAdded365 - currentRepoLinesRemoved365);
      }

      // Categorize for all-time stats if this repo contributed any data
      if (thisRepoAllTimeDataContributed) {
        allTimeCategoryStats[categoryKey].linesAdded += currentRepoAllTimeLinesAdded;
        allTimeCategoryStats[categoryKey].linesRemoved += currentRepoAllTimeLinesRemoved;
        // Only increment allTimeCategoryStats repoCount if it hasn't been counted for this category yet
        // This requires a slightly more complex check, perhaps a Set of repo names per category
        // For simplicity now, let's assume repoCount under allTimeCategoryStats reflects repos with any all-time activity.
        // A more accurate way would be to populate a Set of repo names processed for all-time category stats.
        // Let's refine this: we can count it if it's the first time this category gets non-zero LoC/commits for all-time.
        // Or, simpler for now: just add to repoCount if it contributed. This might overcount if a repo falls into 'other' then 'frontend'.
        // Let's refine: repoCount for categories will be handled by the summary creation logic that iterates uniqueRepoArray.
        // Here, we just sum up lines. The summary part can determine distinct repo counts per category.

        allTimeCategoryStats[categoryKey].netChange =
          (allTimeCategoryStats[categoryKey].netChange || 0) +
          (currentRepoAllTimeLinesAdded - currentRepoAllTimeLinesRemoved);
        // We need a distinct list of repos for allTimeCategoryStats.repoCount, which can be derived later when creating the summary.
        // For now, just sum lines.
      }
    });
    await Promise.all(batchPromises);
  }

  console.log(
    "[DataAccess/GitHub] All-Time: Calculating all-time commit counts from /commits API...",
  );
  // Ensure allTimeTotalCommits is reset before this new calculation method
  allTimeTotalCommits = 0;
  for (const repo of uniqueRepoArray) {
    const owner = repo.owner.login;
    const name = repo.name;
    let page = 1;
    let repoCommitCount = 0;
    debug(`[DataAccess/GitHub] All-Time: Fetching all commits for ${owner}/${name}...`);
    // Get commit count using GraphQL instead of paginated REST API
    // GraphQL allows us to get the total count in a single query instead of paginating through all commits
    try {
      if (!githubUserId) {
        console.warn(
          `[DataAccess/GitHub] All-Time: GitHub User ID not available for ${GITHUB_REPO_OWNER}. Falling back to REST API for commit count for ${owner}/${name}.`,
        );
        throw new Error("GitHub User ID not available for GraphQL commit count.");
      }
      const commitCountQuery = `
        query($owner: String!, $name: String!, $authorId: ID!) {
          repository(owner: $owner, name: $name) {
            object(expression: "HEAD") {
              ... on Commit {
                history(author: {id: $authorId}) {
                  totalCount
                }
              }
            }
          }
        }
      `;

      const response = await graphql<{
        repository?: { object?: { history?: { totalCount?: number } } };
      }>(commitCountQuery, {
        owner,
        name,
        authorId: githubUserId,
        headers: { authorization: `bearer ${GITHUB_API_TOKEN}` },
      });

      const totalCount = response?.repository?.object?.history?.totalCount || 0;
      repoCommitCount = totalCount;

      debug(
        `[DataAccess/GitHub] All-Time: Found ${repoCommitCount} commits for ${owner}/${name} via GraphQL API (using ID).`,
      );
    } catch (error) {
      console.warn(
        `[DataAccess/GitHub] All-Time: Error fetching commit count for ${owner}/${name} via GraphQL:`,
        error instanceof Error ? error.message : String(error),
      );

      // Fall back to traditional REST API if GraphQL fails
      console.log(`[DataAccess/GitHub] All-Time: Falling back to REST API for ${owner}/${name}...`);
      while (true) {
        const commitsUrl = `https://api.github.com/repos/${owner}/${name}/commits?author=${GITHUB_REPO_OWNER}&per_page=100&page=${page}`;

        const res = await fetch(commitsUrl, {
          headers: {
            Authorization: `Bearer ${GITHUB_API_TOKEN}`,
            Accept: "application/vnd.github.v3+json",
          },
        });

        if (!res.ok) {
          console.warn(
            `[DataAccess/GitHub] All-Time: Error fetching commits for ${owner}/${name} (page ${page}): ${res.status}. Stopping count for this repo.`,
          );
          // Consider if this should impact allTimeOverallDataComplete for lines/additions,
          // or if a separate flag for commit count completeness is needed.
          // For now, this primarily affects the accuracy of allTimeTotalCommits.
          break;
        }
        const commits = (await res.json()) as Array<{ sha: string }>;
        if (!Array.isArray(commits)) {
          console.warn(
            `[DataAccess/GitHub] All-Time: Invalid commit data for ${owner}/${name} (page ${page}). Stopping count for this repo.`,
          );
          break;
        }
        if (commits.length === 0) break;

        repoCommitCount += commits.length;

        if (commits.length < 100) break;
        page++;
        // Safety break for very deep pagination, e.g. if a repo has > 2000 commits by the user.
        // Adjust limit if necessary, or remove if confident in all repo sizes.
        if (page > 20) {
          debug(
            `[DataAccess/GitHub] All-Time: Reached ${page} pages for ${owner}/${name}, check for unexpected depth or error in pagination break.`,
          );
        }
        await new Promise((r) => setTimeout(r, 100)); // Small delay between pages to be kind to the API
      }
    }

    allTimeTotalCommits += repoCommitCount;
  }
  console.log(`[DataAccess/GitHub] All-Time: Total commits calculated: ${allTimeTotalCommits}`);

  // NEW: Fetch contribution calendar data using GraphQL
  let yearTotalCommits = 0;
  const trailingYearContributionsCalendar: ContributionDay[] = [];

  try {
    console.log(
      `[DataAccess/GitHub] Fetching contribution calendar for ${GITHUB_REPO_OWNER} via GraphQL API...`,
    );
    const gqlResponse = await graphql<GraphQLUserContributionsResponse>(
      `
        query($username: String!, $from: DateTime!, $to: DateTime!) {
          user(login: $username) {
            contributionsCollection(from: $from, to: $to) {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    contributionLevel
                    date
                  }
                }
              }
            }
          }
        }
      `,
      {
        username: GITHUB_REPO_OWNER,
        from: gqlFromDate.toISOString(),
        to: gqlToDate.toISOString(),
        headers: { authorization: `bearer ${GITHUB_API_TOKEN}` },
      },
    );

    if (gqlResponse?.user?.contributionsCollection?.contributionCalendar) {
      const calendar = gqlResponse.user.contributionsCollection.contributionCalendar;
      yearTotalCommits = calendar.totalContributions;

      // Flatten the weeks and contributionDays into the ContributionDay[] format
      for (const week of calendar.weeks) {
        for (const day of week.contributionDays) {
          trailingYearContributionsCalendar.push({
            date: day.date, // Already YYYY-MM-DD
            count: day.contributionCount,
            level: mapGraphQLContributionLevelToNumeric(day.contributionLevel),
          });
        }
      }
      // Sort by date just in case, though GraphQL usually returns it ordered
      trailingYearContributionsCalendar.sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      console.log(
        `[DataAccess/GitHub] Successfully fetched contribution calendar. Total contributions (trailing year): ${yearTotalCommits}`,
      );
    } else {
      console.warn(
        "[DataAccess/GitHub] Failed to fetch or parse GraphQL contribution calendar. Calendar data will be empty.",
      );
      // Keep yearTotalCommits as 0 and trailingYearContributionsCalendar as empty
    }
  } catch (gqlError: unknown) {
    console.error(
      "[DataAccess/GitHub] CRITICAL: Error fetching GraphQL contribution calendar:",
      gqlError instanceof Error ? gqlError.message : String(gqlError),
    );
    // Keep yearTotalCommits as 0 and trailingYearContributionsCalendar as empty in case of error
  }

  // Track if all repositories were processed successfully for the trailing year
  // By default, assume data is complete unless we find a repository that failed
  let yearOverallDataComplete = true;

  // If we have no repositories, the data is considered complete (edge case)
  if (uniqueRepoArray.length === 0) {
    yearOverallDataComplete = true;
  } else {
    // Check if we had any repository processing errors
    // The repoDataCompleteForYear flag is set to false in error cases within the repository processing loop
    // We'll use the allTimeOverallDataComplete flag which is already tracking this
    yearOverallDataComplete = allTimeOverallDataComplete;
  }

  const trailingYearData: StoredGithubActivityS3 = {
    source: "api",
    data: trailingYearContributionsCalendar,
    totalContributions: yearTotalCommits,
    linesAdded: yearLinesAdded,
    linesRemoved: yearLinesRemoved,
    dataComplete: yearOverallDataComplete,
  };

  try {
    const summaryS3Key = GITHUB_STATS_SUMMARY_S3_KEY_FILE;
    const netYearLoc = (trailingYearData.linesAdded || 0) - (trailingYearData.linesRemoved || 0);
    const yearSummaryData: GitHubActivitySummary = {
      lastUpdatedAtPacific: new Date().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }),
      totalContributions: trailingYearData.totalContributions,
      totalLinesAdded: trailingYearData.linesAdded || 0,
      totalLinesRemoved: trailingYearData.linesRemoved || 0,
      netLinesOfCode: netYearLoc,
      dataComplete:
        trailingYearData.dataComplete !== undefined ? trailingYearData.dataComplete : true,
      totalRepositoriesContributedTo: uniqueRepoArray.length,
      linesOfCodeByCategory: yearCategoryStats,
    };
    await writeJsonS3(summaryS3Key, yearSummaryData);
    debug(`[DataAccess/GitHub-S3] Trailing year GitHub summary saved to ${summaryS3Key}`);
  } catch (summaryError: unknown) {
    console.error(
      "[DataAccess/GitHub-S3] Failed to write trailing year GitHub summary:",
      summaryError instanceof Error ? summaryError.message : String(summaryError),
    );
  }

  console.log(
    `[DataAccess/GitHub] All-time stats calculated in-memory: Commits=${allTimeTotalCommits}, Added=${allTimeLinesAdded}, Removed=${allTimeLinesRemoved}, Complete=${allTimeOverallDataComplete}`,
  );

  // Consistency checks for all-time vs. trailing year
  if (allTimeTotalCommits < yearTotalCommits) {
    console.warn(
      `[DataAccess/GitHub] Critical inconsistency detected: All-time commits (${allTimeTotalCommits}) less than trailing year commits (${yearTotalCommits}). This may indicate an issue with historical data aggregation if all-time is genuinely lower than a single year's recent activity.`,
    );
    // No longer "correcting" allTimeTotalCommits to yearTotalCommits here, as all-time is now derived from its own full dataset processing.
    // The warning is important if this condition occurs.
  }
  if (allTimeLinesAdded < yearLinesAdded) {
    console.warn(
      `[DataAccess/GitHub] Inconsistency detected: All-time lines added (${allTimeLinesAdded}) less than trailing year (${yearLinesAdded}). This might be valid if historical data had net negative contributions over time but recent year was very positive. Verifying logic.`,
    );
    // Not automatically correcting; allTimeLinesAdded is now the sum from all repo history.
  }
  if (allTimeLinesRemoved < yearLinesRemoved) {
    console.warn(
      `[DataAccess/GitHub] Inconsistency detected: All-time lines removed (${allTimeLinesRemoved}) less than trailing year (${yearLinesRemoved}). Similar to lines added, this could be valid. Verifying logic.`,
    );
    // Not automatically correcting.
  }

  let reconciledAllTimeTotalCommits = allTimeTotalCommits;
  if (allTimeTotalCommits < yearTotalCommits) {
    console.log(
      `[DataAccess/GitHub] Reconciling totalContributions for all-time data: Calculated all-time commits (${allTimeTotalCommits}) is less than trailing year commits (${yearTotalCommits}). Using trailing year count as the floor for all-time total contributions.`,
    );
    reconciledAllTimeTotalCommits = yearTotalCommits;
  }

  const allTimeData: StoredGithubActivityS3 = {
    source: "api", // Source is 'api' because it's processed from API/S3 cache, not re-read from aggregated S3 files for this specific object.
    data: [], // All-time data typically doesn't include the daily calendar view
    totalContributions: reconciledAllTimeTotalCommits,
    linesAdded: allTimeLinesAdded,
    linesRemoved: allTimeLinesRemoved,
    dataComplete: allTimeOverallDataComplete,
    // No allTimeTotalContributions field here, totalContributions is the source of truth.
  };

  try {
    // Recalculate allTimeCategoryStats.repoCount based on uniqueRepoArray and their contributions
    const finalAllTimeCategoryStats: GitHubActivitySummary["linesOfCodeByCategory"] = {
      frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
      other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    };
    // const categoryRepoSets: { [key in keyof GitHubActivitySummary['linesOfCodeByCategory']]: Set<string> } = { frontend: new Set(), backend: new Set(), dataEngineer: new Set(), other: new Set() }; // Unused

    // The loop below was empty and repoStatS3Key was unused.
    // for (const repo of uniqueRepoArray) {
    //     const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repo.owner.login}_${repo.name}.csv`; // Unused
    // }

    // For a more accurate allTimeCategoryStats.repoCount, we would need to know which repos contributed to which category over all time.
    // The current `allTimeCategoryStats` has summed lines correctly.
    // Setting repoCount to uniqueRepoArray.length for each category that has non-zero lines is an approximation.
    for (const catKey of Object.keys(allTimeCategoryStats)) {
      const key = catKey as keyof GitHubActivitySummary["linesOfCodeByCategory"];
      finalAllTimeCategoryStats[key].linesAdded = allTimeCategoryStats[key].linesAdded;
      finalAllTimeCategoryStats[key].linesRemoved = allTimeCategoryStats[key].linesRemoved;
      finalAllTimeCategoryStats[key].netChange = allTimeCategoryStats[key].netChange;
      // If a category has any activity, count all unique repos. This is an oversimplification.
      // A better approach would be to track repos per category during the accumulation loop.
      // For now, let's assign uniqueRepoArray.length if the category has LOC.
      if (allTimeCategoryStats[key].linesAdded > 0 || allTimeCategoryStats[key].linesRemoved > 0) {
        finalAllTimeCategoryStats[key].repoCount = uniqueRepoArray.length; // Approximation
      } else {
        finalAllTimeCategoryStats[key].repoCount = 0;
      }
    }

    const netAllTimeLoc = (allTimeData.linesAdded || 0) - (allTimeData.linesRemoved || 0);
    const allTimeSummaryData: GitHubActivitySummary = {
      lastUpdatedAtPacific: new Date().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZoneName: "short",
      }),
      totalContributions: allTimeData.totalContributions,
      totalLinesAdded: allTimeData.linesAdded || 0,
      totalLinesRemoved: allTimeData.linesRemoved || 0,
      netLinesOfCode: netAllTimeLoc,
      dataComplete: allTimeData.dataComplete !== undefined ? allTimeData.dataComplete : true,
      totalRepositoriesContributedTo: uniqueRepoArray.length, // Total unique repos processed
      linesOfCodeByCategory: finalAllTimeCategoryStats, // Use the refined or approximated category stats
    };
    await writeJsonS3(ALL_TIME_SUMMARY_S3_KEY_FILE, allTimeSummaryData);
    debug(
      `[DataAccess/GitHub-S3] All-time GitHub summary saved to ${ALL_TIME_SUMMARY_S3_KEY_FILE}`,
    );
  } catch (summaryError: unknown) {
    console.error(
      "[DataAccess/GitHub-S3] Failed to write all-time GitHub summary:",
      summaryError instanceof Error ? summaryError.message : String(summaryError),
    );
  }

  await calculateAndStoreAggregatedWeeklyActivity();

  const emptyStoredBase: Omit<StoredGithubActivityS3, "source" | "error" | "details"> = {
    data: [],
    totalContributions: 0,
    linesAdded: 0,
    linesRemoved: 0,
    dataComplete: false,
    allTimeTotalContributions: 0,
  };
  const safeTrailingYearData: StoredGithubActivityS3 = trailingYearData || {
    ...emptyStoredBase,
    source: "api",
    error: "Trailing year data generation failed or was incomplete during refresh",
    dataComplete: false,
  };
  const safeAllTimeData: StoredGithubActivityS3 = allTimeData || {
    ...emptyStoredBase,
    source: "api",
    error: "All-time data generation failed or was incomplete during refresh",
    dataComplete: false,
  };
  const combinedActivityDataForS3: GitHubActivityApiResponse = {
    // The segments here conform to GitHubActivitySegment which omits summaryActivity and allTimeTotalContributions
    trailingYearData: { ...safeTrailingYearData, source: "api_multi_file_cache" },
    cumulativeAllTimeData: { ...safeAllTimeData, source: "api_multi_file_cache" },
  };

  try {
    await writeJsonS3<GitHubActivityApiResponse>(
      GITHUB_ACTIVITY_S3_KEY_FILE,
      combinedActivityDataForS3,
    );
    debug(
      `[DataAccess/GitHub-S3] Combined GitHub activity data (ApiResponse structure) saved to ${GITHUB_ACTIVITY_S3_KEY_FILE}`,
    );
  } catch (error: unknown) {
    console.error(
      "[DataAccess/GitHub-S3] Failed to write combined GitHub activity data to S3:",
      error instanceof Error ? error.message : String(error),
    );
  }
  return { trailingYearData, allTimeData };
}

// Default empty state for UserActivityView
const defaultUserActivityView: UserActivityView = {
  source: "empty",
  trailingYearData: {
    data: [] as ContributionDay[],
    totalContributions: 0,
    dataComplete: false,
  },
  allTimeStats: {
    totalContributions: 0,
    linesAdded: 0,
    linesRemoved: 0,
  },
};

/**
 * Retrieves the user's GitHub activity data, using in-memory cache if available, otherwise reading from S3 storage, and falls back to default or partial data if necessary.
 *
 * If valid nested activity data is found in S3, returns a complete {@link UserActivityView}. If legacy or malformed data is detected, attempts partial recovery and returns an error view. If no data is available, returns a default error view.
 *
 * @returns A promise resolving to a {@link UserActivityView} containing trailing year and all-time GitHub activity statistics
 */
export async function getGithubActivity(): Promise<UserActivityView> {
  const cacheKey = "githubActivity";
  const cachedData = ServerCacheInstance.get<UserActivityView>(cacheKey);
  if (cachedData) {
    debug("[DataAccess/GitHub:getGithubActivity] Returning GitHub activity from in-memory cache.");
    return cachedData;
  }

  debug(
    `[DataAccess/GitHub:getGithubActivity] Attempting to read GitHub activity from S3: ${GITHUB_ACTIVITY_S3_KEY_FILE}`,
  );
  const s3ActivityData = await readJsonS3<GitHubActivityApiResponse>(GITHUB_ACTIVITY_S3_KEY_FILE);
  const s3Metadata = await getS3ObjectMetadata(GITHUB_ACTIVITY_S3_KEY_FILE);

  if (s3ActivityData?.trailingYearData && s3ActivityData.cumulativeAllTimeData) {
    debug(
      "[DataAccess/GitHub:getGithubActivity] Successfully read and parsed GitHub activity from S3 (expected nested structure).",
    );

    const trailingYearContributions = s3ActivityData.trailingYearData.totalContributions || 0;
    const allTimeContributions = s3ActivityData.cumulativeAllTimeData.totalContributions || 0;

    if (allTimeContributions < trailingYearContributions) {
      console.warn(
        `[DataAccess/GitHub:getGithubActivity] Data inconsistency: All-time contributions (${allTimeContributions}) < trailing year (${trailingYearContributions}). Displaying S3-derived all-time count; trailing year count from API is higher.`,
      );
    }

    const s3TrailingYearDataDays: ContributionDay[] =
      s3ActivityData.trailingYearData.data || ([] as ContributionDay[]);

    const userView: UserActivityView = {
      source: "s3-store",
      trailingYearData: {
        data: s3TrailingYearDataDays,
        totalContributions: trailingYearContributions,
        linesAdded: s3ActivityData.trailingYearData.linesAdded,
        linesRemoved: s3ActivityData.trailingYearData.linesRemoved,
        dataComplete: s3ActivityData.trailingYearData.dataComplete ?? false,
      },
      allTimeStats: {
        totalContributions: allTimeContributions,
        linesAdded: Math.max(
          s3ActivityData.cumulativeAllTimeData.linesAdded || 0,
          s3ActivityData.trailingYearData.linesAdded || 0,
        ),
        linesRemoved: Math.max(
          s3ActivityData.cumulativeAllTimeData.linesRemoved || 0,
          s3ActivityData.trailingYearData.linesRemoved || 0,
        ),
      },
      lastRefreshed: s3Metadata?.LastModified?.toISOString(),
    };
    ServerCacheInstance.set(cacheKey, userView);
    return userView;
  }

  let errorView: UserActivityView;
  if (isOldFlatStoredGithubActivityS3Format(s3ActivityData)) {
    console.warn(
      "[DataAccess/GitHub:getGithubActivity] Detected outdated flat structure in S3. Attempting partial data recovery.",
    );
    const totalContributions = s3ActivityData.totalContributions || 0;
    const linesAdded = s3ActivityData.linesAdded || 0;
    const linesRemoved = s3ActivityData.linesRemoved || 0;
    errorView = {
      source: "error",
      error:
        "Outdated data format detected. Some data may be incomplete. A refresh is recommended.",
      trailingYearData: {
        data: s3ActivityData.data || ([] as ContributionDay[]),
        totalContributions: totalContributions,
        dataComplete: s3ActivityData.dataComplete ?? false,
      },
      allTimeStats: {
        totalContributions: s3ActivityData.allTimeTotalContributions || totalContributions,
        linesAdded: linesAdded,
        linesRemoved: linesRemoved,
      },
      lastRefreshed: s3Metadata?.LastModified?.toISOString(),
    };
  } else if (s3ActivityData) {
    console.warn(
      "[DataAccess/GitHub:getGithubActivity] S3 data has invalid structure. Attempting partial data recovery.",
    );
    let trailingYearData: UserActivityView["trailingYearData"] = {
      data: [] as ContributionDay[],
      totalContributions: 0,
      dataComplete: false,
      // linesAdded and linesRemoved are optional and can be initially undefined
    };
    if (s3ActivityData.trailingYearData) {
      trailingYearData = {
        data: s3ActivityData.trailingYearData.data || ([] as ContributionDay[]),
        totalContributions: s3ActivityData.trailingYearData.totalContributions || 0,
        linesAdded: s3ActivityData.trailingYearData.linesAdded ?? undefined,
        linesRemoved: s3ActivityData.trailingYearData.linesRemoved ?? undefined,
        dataComplete: s3ActivityData.trailingYearData.dataComplete ?? false,
      };
    }
    let allTimeStats = { totalContributions: 0, linesAdded: 0, linesRemoved: 0 };
    if (s3ActivityData.cumulativeAllTimeData) {
      allTimeStats = {
        totalContributions: s3ActivityData.cumulativeAllTimeData.totalContributions || 0,
        linesAdded: s3ActivityData.cumulativeAllTimeData.linesAdded || 0,
        linesRemoved: s3ActivityData.cumulativeAllTimeData.linesRemoved || 0,
      };
    }
    if (allTimeStats.totalContributions < trailingYearData.totalContributions) {
      allTimeStats.totalContributions = trailingYearData.totalContributions;
    }
    errorView = {
      source: "error",
      error: "Incomplete data structure detected. Some data was recovered but may be partial.",
      trailingYearData: trailingYearData,
      allTimeStats: allTimeStats,
      lastRefreshed: s3Metadata?.LastModified?.toISOString(),
    };
  } else {
    console.warn(
      "[DataAccess/GitHub:getGithubActivity] Failed to read GitHub activity from S3. Returning default values.",
    );
    errorView = {
      ...defaultUserActivityView,
      source: "error",
      error: "Failed to load GitHub activity data. Please try refreshing.",
      lastRefreshed: s3Metadata?.LastModified?.toISOString(),
    };
  }
  ServerCacheInstance.set(cacheKey, errorView);
  return errorView;
}

/**
 * Scans repository CSV statistic files in S3 for missing, empty, or malformed data and attempts to repair them by refetching contributor stats from the GitHub API.
 *
 * @returns A promise resolving to an object summarizing the operation, including the number of repositories scanned, successfully repaired, and failed repairs
 *
 * @remark Requires a valid GitHub API token to perform repairs. If the token is missing or the API does not provide user-specific stats, repairs may fail for some repositories.
 */
async function detectAndRepairCsvFiles(): Promise<{
  scannedRepos: number;
  repairedRepos: number;
  failedRepairs: number;
}> {
  console.log("[DataAccess/GitHub] Running CSV integrity check and repair...");

  if (!GITHUB_API_TOKEN) {
    console.warn("[DataAccess/GitHub] GitHub API token is missing. Cannot perform CSV repair.");
    return { scannedRepos: 0, repairedRepos: 0, failedRepairs: 0 };
  }

  let repoList: Array<{ owner: { login: string }; name: string }> = [];
  try {
    console.log("[DataAccess/GitHub] Fetching repository list for CSV integrity check...");
    const { user } = await graphql<GitHubGraphQLContributionResponse>(
      `
      query($username: String!) {
        user(login: $username) {
          repositoriesContributedTo(
            first: 100,
            contributionTypes: [COMMIT],
            includeUserRepositories: true,
            orderBy: { field: PUSHED_AT, direction: DESC }
          ) {
            nodes { name owner { login } }
          }
        }
      }
    `,
      { username: GITHUB_REPO_OWNER, headers: { authorization: `bearer ${GITHUB_API_TOKEN}` } },
    );

    const nodes = user?.repositoriesContributedTo?.nodes || [];
    repoList = nodes.filter((n) => n !== null) as Array<{ owner: { login: string }; name: string }>;
  } catch (error) {
    console.error("[DataAccess/GitHub] Failed to fetch repository list for CSV repair:", error);
    return { scannedRepos: 0, repairedRepos: 0, failedRepairs: 0 };
  }

  console.log(
    `[DataAccess/GitHub] Found ${repoList.length} repositories to check for CSV integrity`,
  );
  let repairedCount = 0;
  let failedCount = 0;

  for (const repo of repoList) {
    const repoOwner = repo.owner.login;
    const repoName = repo.name;
    const repoStatS3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}.csv`;
    try {
      const csvBuffer = await readBinaryS3(repoStatS3Key);
      let needsRepair = false;
      if (!csvBuffer || csvBuffer.length === 0) {
        console.log(
          `[DataAccess/GitHub] CSV repair: Missing or empty CSV for ${repoOwner}/${repoName}`,
        );
        needsRepair = true;
      } else {
        const lines = csvBuffer.toString().split("\n").filter(Boolean);
        if (lines.length === 0) {
          console.log(
            `[DataAccess/GitHub] CSV repair: Empty CSV (after filtering) for ${repoOwner}/${repoName}`,
          );
          needsRepair = true;
        } else {
          const hasInvalidLines = lines.some((line) => {
            const parts = line.split(",");
            return parts.length !== 4 || parts.some((part) => Number.isNaN(Number(part)));
          });
          if (hasInvalidLines) {
            console.log(
              `[DataAccess/GitHub] CSV repair: Invalid data format in CSV for ${repoOwner}/${repoName}`,
            );
            needsRepair = true;
          }
        }
      }

      if (needsRepair) {
        console.log(
          `[DataAccess/GitHub] CSV repair: Attempting to repair data for ${repoOwner}/${repoName}`,
        );
        const statsResponse = await fetchWithRetry(
          `https://api.github.com/repos/${repoOwner}/${repoName}/stats/contributors`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_API_TOKEN}`,
              Accept: "application/vnd.github.v3+json",
            },
          },
        );
        if (statsResponse.ok) {
          const contributors = (await statsResponse.json()) as GithubContributorStatsEntry[];
          const ownerLoginLower = GITHUB_REPO_OWNER.toLowerCase();
          const userStatsEntry = contributors.find(
            (c) => c?.author?.login.toLowerCase() === ownerLoginLower,
          );
          if (userStatsEntry?.weeks && Array.isArray(userStatsEntry.weeks)) {
            const weeklyStats = userStatsEntry.weeks
              .map((w) => ({
                w: w.w,
                a: w.a,
                d: w.d,
                c: w.c,
              }))
              .sort((a, b) => a.w - b.w);
            if (weeklyStats.length > 0) {
              await writeBinaryS3(
                repoStatS3Key,
                Buffer.from(weeklyStats.map((w) => `${w.w},${w.a},${w.d},${w.c}`).join("\n")),
                "text/csv",
              );
              console.log(
                `[DataAccess/GitHub] CSV repair: Successfully repaired ${repoOwner}/${repoName} with ${weeklyStats.length} weeks of data`,
              );
              repairedCount++;
            } else {
              console.warn(
                `[DataAccess/GitHub] CSV repair: No weekly stats found for ${repoOwner}/${repoName} from API to repair.`,
              );
              failedCount++; // Or consider if this is a success if the API says no data
            }
          } else {
            console.warn(
              `[DataAccess/GitHub] CSV repair: No user-specific stats found for ${repoOwner}/${repoName} from API.`,
            );
            failedCount++;
          }
        } else {
          console.warn(
            `[DataAccess/GitHub] CSV repair: Failed to fetch stats for ${repoOwner}/${repoName}, status ${statsResponse.status}`,
          );
          failedCount++;
        }
      }
    } catch (error) {
      console.error(
        `[DataAccess/GitHub] CSV repair: Error processing ${repoOwner}/${repoName}:`,
        error,
      );
      failedCount++;
    }
  }
  console.log(
    `[DataAccess/GitHub] CSV repair completed: Scanned ${repoList.length} repos, repaired ${repairedCount}, failed ${failedCount}`,
  );
  return {
    scannedRepos: repoList.length,
    repairedRepos: repairedCount,
    failedRepairs: failedCount,
  };
}

/**
 * Aggregates weekly lines added and removed across all repository CSV files in S3 and stores the result as a single JSON file.
 *
 * @returns A promise that resolves to an object containing the aggregated weekly activity array and a flag indicating whether all data was processed successfully, or null if in DRY_RUN mode.
 *
 * @remark If any repository CSV is missing or unreadable, the `overallDataComplete` flag will be set to `false`.
 */
export async function calculateAndStoreAggregatedWeeklyActivity(): Promise<{
  aggregatedActivity: AggregatedWeeklyActivity[];
  overallDataComplete: boolean;
} | null> {
  if (process.env.DRY_RUN === "true") {
    debug("[DataAccess/GitHub-S3] DRY RUN mode: skipping aggregated weekly activity calculation.");
    return null;
  }
  const overrideCalc = (
    globalThis as {
      calculateAndStoreAggregatedWeeklyActivity?: typeof calculateAndStoreAggregatedWeeklyActivity;
    }
  ).calculateAndStoreAggregatedWeeklyActivity;
  if (
    typeof overrideCalc === "function" &&
    overrideCalc !== calculateAndStoreAggregatedWeeklyActivity
  ) {
    return overrideCalc();
  }
  console.log("[DataAccess/GitHub-S3] Calculating aggregated weekly activity...");
  let overallDataComplete = true;
  const weeklyTotals: { [weekStart: string]: { added: number; removed: number } } = {};
  const today = new Date();
  let s3StatFileKeys: string[] = [];
  try {
    console.log(
      `[DataAccess/GitHub-S3] Listing objects in S3 with prefix: ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/`,
    );
    s3StatFileKeys = await s3UtilsListS3Objects(REPO_RAW_WEEKLY_STATS_S3_KEY_DIR);
    debug(`[DataAccess/GitHub-S3] Found ${s3StatFileKeys.length} potential stat files in S3.`);
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.error(
      `[DataAccess/GitHub-S3] Aggregation: Error listing S3 objects in ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/:`,
      message,
    );
    await writeJsonS3(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, []); // Write empty if listing fails
    return { aggregatedActivity: [], overallDataComplete: false };
  }
  s3StatFileKeys = s3StatFileKeys.filter((key) => key.endsWith(".csv"));
  if (s3StatFileKeys.length === 0) {
    debug(
      `[DataAccess/GitHub-S3] Aggregation: No raw weekly stat files found in S3 path ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/. Nothing to aggregate.`,
    );
    await writeJsonS3(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, []);
    return { aggregatedActivity: [], overallDataComplete: true }; // No files means data is "complete" in terms of processing what's there
  }
  for (const repoStatS3Key of s3StatFileKeys) {
    try {
      const buf = await readBinaryS3(repoStatS3Key);
      if (!buf) {
        debug(`[DataAccess/GitHub-S3] Aggregation: No data in ${repoStatS3Key}, skipping.`);
        overallDataComplete = false; // Missing data for a repo means overall is not complete
        continue;
      }
      const lines = buf.toString("utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        const [w, a, d] = line.split(",");
        const weekDate = new Date(Number(w) * 1000);
        if (weekDate > today) continue; // Ignore future weeks if any
        const weekKey = weekDate.toISOString().split("T")[0];
        if (!weeklyTotals[weekKey]) weeklyTotals[weekKey] = { added: 0, removed: 0 };
        weeklyTotals[weekKey].added += Number(a) || 0;
        weeklyTotals[weekKey].removed += Number(d) || 0;
      }
    } catch (err) {
      debug(`[DataAccess/GitHub-S3] Aggregation: Error reading ${repoStatS3Key}, skipping.`, err);
      overallDataComplete = false; // Error reading a file means overall is not complete
    }
  }
  debug(
    `[DataAccess/GitHub-S3] Aggregation: Processed ${s3StatFileKeys.length} S3 stat files from ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}.`,
  );
  const aggregatedActivity: AggregatedWeeklyActivity[] = Object.entries(weeklyTotals)
    .map(([weekStartDate, totals]) => ({
      weekStartDate,
      linesAdded: totals.added,
      linesRemoved: totals.removed,
    }))
    .sort((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());
  await writeJsonS3(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, aggregatedActivity);
  console.log(
    `[DataAccess/GitHub-S3] Aggregated weekly activity calculated and stored to ${AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE}. Total weeks aggregated: ${aggregatedActivity.length}. Overall data complete: ${overallDataComplete}`,
  );
  return { aggregatedActivity, overallDataComplete };
}
