/**
 * GitHub Data Access Module
 *
 * Orchestrates GitHub activity data operations using specialized modules:
 * - github-api.ts: Direct GitHub API interactions
 * - github-storage.ts: PostgreSQL-backed activity record operations
 * - github-processing.ts: Data processing and aggregation
 * - github-repo-stats.ts: Per-repository stats processing
 * - github-commit-counts.ts: Commit count aggregation
 * - github-contributions.ts: Contribution calendar handling
 * - github-csv-repair.ts: CSV integrity checks and repair
 * - github-activity-summaries.ts: Summary persistence
 *
 * @module data-access/github
 */

import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
} from "@/types/schemas/github-storage";
import { getTrailingYearDate, startOfDay, endOfDay } from "@/lib/utils/date-format";
import { isOperationAllowed } from "@/lib/rate-limiter";

// Import from specialized modules
import {
  fetchContributedRepositories,
  isGitHubApiConfigured,
  getGitHubUsername,
} from "./github-api";

import { writeGitHubActivityRecord } from "./github-storage";
import { writeGitHubActivitySummary } from "./github-activity-summaries";
import { detectAndRepairCsvFiles } from "./github-csv-repair";
import { calculateAllTimeCommitCount } from "./github-commit-counts";
import { processRepositoryStats } from "./github-repo-stats";
import { GITHUB_REFRESH_RATE_LIMIT_CONFIG } from "@/lib/constants";

import {
  calculateAndStoreAggregatedWeeklyActivity,
  createEmptyCategoryStats,
} from "./github-processing";
import { fetchTrailingYearContributionCalendar } from "./github-contributions";

// Configuration
const GITHUB_REPO_OWNER = getGitHubUsername();

// --- GitHub Activity Data Refresh ---

/**
 * Refreshes and recalculates GitHub activity data by fetching repository statistics, commit
 * history, and contribution calendars from the GitHub API, then updates the PostgreSQL-backed
 * store with the latest summary and per-repository data.
 *
 * This function:
 * - Optionally repairs CSV files for data completeness.
 * - Fetches all non-forked repositories contributed to by the configured user.
 * - For each repository, retrieves weekly contributor statistics and falls back to database cache if necessary.
 * - Aggregates lines of code added/removed and commit counts for both the trailing year and all-time.
 * - Fetches the user's contribution calendar for the trailing year.
 * - Writes updated CSV checksums, summary rows, and combined activity data to PostgreSQL.
 * - Performs consistency checks between trailing year and all-time statistics.
 * - Triggers aggregation of weekly activity across all repositories.
 *
 * @returns A promise that resolves to an object containing `trailingYearData` and `allTimeData`, or `null` if the refresh fails
 */
export async function refreshGitHubActivityDataFromApi(): Promise<{
  trailingYearData: GitHubActivitySegment;
  allTimeData: GitHubActivitySegment;
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
  console.log(
    `[DataAccess/GitHub] Fetching list of contributed repositories and user ID for ${GITHUB_REPO_OWNER} via GraphQL API...`,
  );
  const { userId: githubUserId, repositories: uniqueRepoArray } =
    await fetchContributedRepositories(GITHUB_REPO_OWNER);

  if (uniqueRepoArray.length === 0) {
    console.warn("[DataAccess/GitHub] No non-forked repositories contributed to found for user.");
    const emptyActivityData: GitHubActivitySegment = {
      source: "api",
      data: [],
      totalContributions: 0,
      linesAdded: 0,
      linesRemoved: 0,
      dataComplete: true,
    };
    const emptyActivity: GitHubActivityApiResponse = {
      trailingYearData: emptyActivityData,
      cumulativeAllTimeData: emptyActivityData,
    };
    const summaryWritten = await writeGitHubActivitySummary({
      allTimeData: emptyActivityData,
      totalRepositoriesContributedTo: 0,
      allTimeCategoryStats: createEmptyCategoryStats(),
    });
    if (!summaryWritten) {
      throw new Error("GitHub activity refresh failed to persist its summary record.");
    }
    await calculateAndStoreAggregatedWeeklyActivity([]);
    await writeGitHubActivityRecord(
      emptyActivity,
      GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
    );
    return { trailingYearData: emptyActivityData, allTimeData: emptyActivityData };
  }

  console.log("[DataAccess/GitHub] Calculating trailing year stats...");
  const trailingYearFromDate = getTrailingYearDate(now);
  const gqlFromDate = startOfDay(trailingYearFromDate);
  const gqlToDate = endOfDay(now);

  const {
    yearLinesAdded,
    yearLinesRemoved,
    priorYearCommitStats,
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

  const trailingYearData: GitHubActivitySegment = {
    source: "api",
    data: trailingYearContributionsCalendar,
    totalContributions: yearTotalCommits,
    linesAdded: yearLinesAdded,
    linesRemoved: yearLinesRemoved,
    dataComplete: allTimeOverallDataComplete,
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

  const lifetimeContributionEstimate = yearTotalCommits + priorYearCommitStats.totalCommits;

  const allTimeData: GitHubActivitySegment = {
    source: "api", // Source is 'api' because it's processed from API/database cache.
    data: [], // All-time data typically doesn't include the daily calendar view
    totalContributions: lifetimeContributionEstimate,
    linesAdded: allTimeLinesAdded,
    linesRemoved: allTimeLinesRemoved,
    dataComplete: allTimeOverallDataComplete,
    allPriorYearCommits: priorYearCommitStats,
  };

  const summaryWritten = await writeGitHubActivitySummary({
    allTimeData,
    totalRepositoriesContributedTo: uniqueRepoArray.length,
    allTimeCategoryStats,
  });
  if (!summaryWritten) {
    throw new Error("GitHub activity refresh failed to persist its summary record.");
  }

  await calculateAndStoreAggregatedWeeklyActivity(
    uniqueRepoArray.map((repository) => repository.nameWithOwner),
  );

  const combinedActivityData: GitHubActivityApiResponse = {
    trailingYearData,
    cumulativeAllTimeData: allTimeData,
  };

  await writeGitHubActivityRecord(combinedActivityData);
  return { trailingYearData, allTimeData };
}
