/**
 * GitHub Data Access Module
 *
 * Orchestrates GitHub activity data operations using specialized modules:
 * - github-api.ts: Direct GitHub API interactions
 * - github-storage.ts: S3 storage operations
 * - github-processing.ts: Data processing and aggregation
 * - github-repo-stats.ts: Per-repository stats processing
 * - github-commit-counts.ts: Commit count aggregation
 * - github-contributions.ts: Contribution calendar handling
 * - github-csv-repair.ts: CSV integrity checks and repair
 * - github-activity-summaries.ts: Summary persistence
 *
 * @module data-access/github
 */

import { debug } from "@/lib/utils/debug";
import {
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type StoredGithubActivityS3,
  type GithubRepoNode,
} from "@/types/github";
import { getTrailingYearDate, startOfDay, endOfDay } from "@/lib/utils/date-format";
import { isOperationAllowed } from "@/lib/rate-limiter";
import { createCategorizedError } from "@/lib/utils/error-utils";

// Import from specialized modules
import {
  fetchContributedRepositories,
  isGitHubApiConfigured,
  getGitHubUsername,
} from "./github-api";

import { writeGitHubActivityToS3 } from "./github-storage";
import { writeGitHubActivitySummaries } from "./github-activity-summaries";
import { detectAndRepairCsvFiles } from "./github-csv-repair";
import { calculateAllTimeCommitCount } from "./github-commit-counts";
import { processRepositoryStats } from "./github-repo-stats";
import { GITHUB_ACTIVITY_S3_KEY_FILE, GITHUB_REFRESH_RATE_LIMIT_CONFIG } from "@/lib/constants";

import { calculateAndStoreAggregatedWeeklyActivity } from "./github-processing";
import { fetchTrailingYearContributionCalendar } from "./github-contributions";

// Configuration
const GITHUB_REPO_OWNER = getGitHubUsername();

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
  if (!isGitHubApiConfigured()) {
    console.error(
      "[DataAccess/GitHub] CRITICAL: GitHub API token is missing. Cannot fetch GitHub activity. " +
        "Please ensure GITHUB_ACCESS_TOKEN_COMMIT_GRAPH is set in your environment variables.",
    );
    return null;
  }

  console.log(
    `[DataAccess/GitHub] Initiating GitHub activity refresh from API for ${GITHUB_REPO_OWNER}...`,
  );

  // Check if we're rate limited before starting expensive operations
  if (!isOperationAllowed("github-api", "global", GITHUB_REFRESH_RATE_LIMIT_CONFIG)) {
    console.warn("[DataAccess/GitHub] Skipping refresh due to rate limit. Will retry later.");
    return null;
  }

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
  let uniqueRepoArray: GithubRepoNode[];
  let githubUserId: string | undefined; // Declare githubUserId
  try {
    console.log(
      `[DataAccess/GitHub] Fetching list of contributed repositories and user ID for ${GITHUB_REPO_OWNER} via GraphQL API...`,
    );

    const { userId, repositories } = await fetchContributedRepositories(GITHUB_REPO_OWNER);
    githubUserId = userId;
    uniqueRepoArray = repositories;
  } catch (gqlError: unknown) {
    const categorizedError = createCategorizedError(gqlError, "github");
    console.error(
      "[DataAccess/GitHub] CRITICAL: Failed to fetch repository list via GraphQL:",
      categorizedError.message,
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
    await writeGitHubActivityToS3(wrapGithubActivity(result) as GitHubActivityApiResponse);
    return result;
  }

  console.log("[DataAccess/GitHub] Calculating trailing year stats...");
  const trailingYearFromDate = getTrailingYearDate(now);
  const gqlFromDate = startOfDay(trailingYearFromDate);
  const gqlToDate = endOfDay(now);

  const {
    yearLinesAdded,
    yearLinesRemoved,
    yearCategoryStats,
    olderThanYearCommitStats,
    allTimeLinesAdded,
    allTimeLinesRemoved,
    allTimeOverallDataComplete,
    allTimeCategoryStats,
    failedRepoCount,
  } = await processRepositoryStats({
    repos: uniqueRepoArray,
    githubRepoOwner: GITHUB_REPO_OWNER,
    trailingYearFromDate,
    now,
  });

  if (failedRepoCount > 0) {
    console.warn(`[DataAccess/GitHub] Failed to process ${failedRepoCount} repositories`);
  }

  const allTimeTotalCommits = await calculateAllTimeCommitCount({
    repos: uniqueRepoArray,
    githubRepoOwner: GITHUB_REPO_OWNER,
    githubUserId,
  });

  const {
    totalContributions: yearTotalCommits,
    contributionDays: trailingYearContributionsCalendar,
  } = await fetchTrailingYearContributionCalendar({
    githubRepoOwner: GITHUB_REPO_OWNER,
    fromDate: gqlFromDate,
    toDate: gqlToDate,
  });

  const yearOverallDataComplete = uniqueRepoArray.length === 0 ? true : allTimeOverallDataComplete;

  const trailingYearData: StoredGithubActivityS3 = {
    source: "api",
    data: trailingYearContributionsCalendar,
    totalContributions: yearTotalCommits,
    linesAdded: yearLinesAdded,
    linesRemoved: yearLinesRemoved,
    dataComplete: yearOverallDataComplete,
  };

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
  }
  if (allTimeLinesRemoved < yearLinesRemoved) {
    console.warn(
      `[DataAccess/GitHub] Inconsistency detected: All-time lines removed (${allTimeLinesRemoved}) less than trailing year (${yearLinesRemoved}). Similar to lines added, this could be valid. Verifying logic.`,
    );
  }

  const lifetimeContributionEstimate =
    (yearTotalCommits || 0) + (olderThanYearCommitStats.totalCommits || 0);

  const allTimeData: StoredGithubActivityS3 = {
    source: "api", // Source is 'api' because it's processed from API/S3 cache, not re-read from aggregated S3 files for this specific object.
    data: [], // All-time data typically doesn't include the daily calendar view
    totalContributions: lifetimeContributionEstimate,
    linesAdded: allTimeLinesAdded,
    linesRemoved: allTimeLinesRemoved,
    dataComplete: allTimeOverallDataComplete,
    allCommitsOlderThanYear: olderThanYearCommitStats,
    // No allTimeTotalContributions field here, totalContributions is the source of truth.
  };

  await writeGitHubActivitySummaries({
    trailingYearData,
    allTimeData,
    totalRepositoriesContributedTo: uniqueRepoArray.length,
    yearCategoryStats,
    allTimeCategoryStats,
  });

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
    await writeGitHubActivityToS3(combinedActivityDataForS3);
    debug(
      `[DataAccess/GitHub-S3] Combined GitHub activity data (ApiResponse structure) saved to ${GITHUB_ACTIVITY_S3_KEY_FILE}`,
    );
  } catch (error: unknown) {
    const categorizedError = createCategorizedError(error, "github");
    console.error(
      "[DataAccess/GitHub-S3] Failed to write combined GitHub activity data to S3:",
      categorizedError.message,
    );
  }
  return { trailingYearData, allTimeData };
}
