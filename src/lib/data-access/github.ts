/**
 * GitHub Data Access Module
 *
 * Orchestrates GitHub activity data operations using specialized modules:
 * - github-api.ts: Direct GitHub API interactions
 * - github-storage.ts: PostgreSQL-backed activity record operations
 * - github-processing.ts: Data processing and aggregation
 * - github-repo-stats.ts: Per-repository stats processing
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
import { getTrailingYearDate, endOfDay } from "@/lib/utils/date-format";
import { isOperationAllowed } from "@/lib/rate-limiter";

// Import from specialized modules
import {
  fetchContributedRepositories,
  isGitHubApiConfigured,
  getGitHubUsername,
} from "./github-api";

import { writeGitHubActivityRefreshRecord } from "./github-storage";
import { createGitHubActivitySummary } from "./github-activity-summaries";
import { detectAndRepairCsvFiles } from "./github-csv-repair";
import { processRepositoryStats } from "./github-repo-stats";
import { GITHUB_REFRESH_RATE_LIMIT_CONFIG } from "@/lib/constants";

import { calculateAggregatedWeeklyActivity, createEmptyCategoryStats } from "./github-processing";
import {
  fetchTrailingYearContributionCalendar,
  fetchHistoricalContributionTotal,
} from "./github-contributions";
import { GitHubActivityRefreshPreservedError } from "./github-refresh-outcome";

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
        "Set GITHUB_ACCESS_TOKEN_COMMIT_GRAPH, GITHUB_API_TOKEN, or GITHUB_TOKEN.",
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
  const { repositories: uniqueRepoArray, dataComplete: inventoryComplete } =
    await fetchContributedRepositories(GITHUB_REPO_OWNER);

  const trailingYearFromDate = getTrailingYearDate(now);
  const { totalContributions: yearTotalContributions, contributionDays } =
    await fetchTrailingYearContributionCalendar({
      githubRepoOwner: GITHUB_REPO_OWNER,
      fromDate: trailingYearFromDate,
      toDate: endOfDay(now),
    });
  const historicalContributions = await fetchHistoricalContributionTotal(
    GITHUB_REPO_OWNER,
    trailingYearFromDate,
  );
  const lifetimeContributions = yearTotalContributions + historicalContributions;

  if (inventoryComplete && uniqueRepoArray.length === 0 && lifetimeContributions === 0) {
    console.warn("[DataAccess/GitHub] No non-forked repositories contributed to found for user.");
    const emptyActivityData: GitHubActivitySegment = {
      source: "api",
      data: [],
      totalContributions: 0,
      contributionCountSource: "github-calendar",
      linesAdded: 0,
      linesRemoved: 0,
      dataComplete: true,
    };
    const emptyActivity: GitHubActivityApiResponse = {
      trailingYearData: emptyActivityData,
      cumulativeAllTimeData: emptyActivityData,
    };
    const summary = createGitHubActivitySummary({
      allTimeData: emptyActivityData,
      totalRepositoriesContributedTo: 0,
      linesOfCodeByCategory: createEmptyCategoryStats(),
    });
    const aggregate = await calculateAggregatedWeeklyActivity([]);
    if (aggregate === null) {
      throw new Error("GitHub activity refresh skipped aggregate calculation in dry-run mode.");
    }
    const refreshWritten = await writeGitHubActivityRefreshRecord(
      emptyActivity,
      summary,
      aggregate.aggregatedActivity,
      GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
    );
    if (!refreshWritten) {
      throw new GitHubActivityRefreshPreservedError();
    }
    return { trailingYearData: emptyActivityData, allTimeData: emptyActivityData };
  }

  console.log("[DataAccess/GitHub] Calculating trailing year stats...");
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

  const trailingYearData: GitHubActivitySegment = {
    source: "api",
    data: contributionDays,
    totalContributions: yearTotalContributions,
    contributionCountSource: "github-calendar",
    linesAdded: yearLinesAdded,
    linesRemoved: yearLinesRemoved,
    dataComplete: allTimeOverallDataComplete && inventoryComplete,
  };

  console.log(
    `[DataAccess/GitHub] All-time stats calculated in-memory: Contributions=${lifetimeContributions}, Added=${allTimeLinesAdded}, Removed=${allTimeLinesRemoved}, Complete=${allTimeOverallDataComplete}`,
  );

  // Consistency checks for all-time vs. trailing year
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

  const allTimeData: GitHubActivitySegment = {
    source: "api", // Source is 'api' because it's processed from API/database cache.
    data: [], // All-time data typically doesn't include the daily calendar view
    totalContributions: lifetimeContributions,
    contributionCountSource: "github-calendar",
    linesAdded: allTimeLinesAdded,
    linesRemoved: allTimeLinesRemoved,
    dataComplete: allTimeOverallDataComplete && inventoryComplete,
    allPriorYearCommits: priorYearCommitStats,
  };

  const aggregate = await calculateAggregatedWeeklyActivity(
    uniqueRepoArray.map((repository) => repository.nameWithOwner),
  );
  if (aggregate === null) {
    throw new Error("GitHub activity refresh skipped aggregate calculation in dry-run mode.");
  }
  trailingYearData.dataComplete &&= aggregate.overallDataComplete;
  allTimeData.dataComplete &&= aggregate.overallDataComplete;
  const combinedActivityData: GitHubActivityApiResponse = {
    trailingYearData,
    cumulativeAllTimeData: allTimeData,
  };
  const summary = createGitHubActivitySummary({
    allTimeData,
    totalRepositoriesContributedTo: uniqueRepoArray.length,
    linesOfCodeByCategory: allTimeCategoryStats,
  });
  const refreshWritten = await writeGitHubActivityRefreshRecord(
    combinedActivityData,
    summary,
    aggregate.aggregatedActivity,
  );
  if (!refreshWritten) {
    throw new GitHubActivityRefreshPreservedError();
  }
  return { trailingYearData, allTimeData };
}
