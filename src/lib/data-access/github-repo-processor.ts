/**
 * Single repository stats processor
 * @module data-access/github-repo-processor
 */

import { debug } from "@/lib/utils/debug";
import { readBinaryS3, writeBinaryS3 } from "@/lib/s3/binary";
import { parseGitHubStatsCSV, generateGitHubStatsCSV } from "@/lib/utils/csv";
import { unixToDate } from "@/lib/utils/date-format";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { filterContributorStats } from "./github-processing";
import {
  fetchContributorStats,
  GitHubContributorStatsPendingError,
  GitHubContributorStatsRateLimitError,
} from "./github-api";
import { REPO_RAW_WEEKLY_STATS_S3_KEY_DIR } from "@/lib/constants";
import type { GithubRepoNode, RepoRawWeeklyStat, RepoWeeklyStatCache } from "@/types/github";

export type SingleRepoProcessingInput = {
  repo: GithubRepoNode;
  githubRepoOwner: string;
  trailingYearFromDate: Date;
  now: Date;
};

export type SingleRepoProcessingResult = {
  yearLinesAdded: number;
  yearLinesRemoved: number;
  allTimeLinesAdded: number;
  allTimeLinesRemoved: number;
  olderThanYearCommits: number;
  olderThanYearLinesAdded: number;
  olderThanYearLinesRemoved: number;
  dataComplete: boolean;
  hasAllTimeData: boolean;
};

function isErrorOrPendingStatus(
  status: RepoWeeklyStatCache["status"],
): status is "fetch_error" | "pending_202_from_api" | "pending_rate_limit" {
  return (
    status === "fetch_error" || status === "pending_202_from_api" || status === "pending_rate_limit"
  );
}

async function fetchOrLoadRepoStats(
  repoOwner: string,
  repoName: string,
  githubRepoOwner: string,
  s3Key: string,
): Promise<{ stats: RepoRawWeeklyStat[]; status: RepoWeeklyStatCache["status"] }> {
  const contributors = await fetchContributorStats(repoOwner, repoName);
  const ownerStats = filterContributorStats(contributors, githubRepoOwner);

  if (ownerStats?.weeks && Array.isArray(ownerStats.weeks)) {
    const userStats = ownerStats.weeks.map((w: RepoRawWeeklyStat) => ({
      w: w.w,
      a: w.a,
      d: w.d,
      c: w.c,
    }));
    if (userStats.length > 0) {
      return { stats: userStats.toSorted((a, b) => a.w - b.w), status: "complete" };
    }
  }

  // No API data - try S3 fallback
  const existingBuffer = await readBinaryS3(s3Key);
  if (existingBuffer && existingBuffer.length > 0) {
    debug(`[GitHub-Repo] Using S3 fallback for ${repoOwner}/${repoName}`);
    const csvString = existingBuffer.toString();
    if (csvString.length > 10 * 1024 * 1024) {
      console.warn(`[GitHub-Repo] CSV too large for ${repoOwner}/${repoName}, truncating`);
      return { stats: [], status: "empty_no_user_contribs" };
    }
    return {
      stats: parseGitHubStatsCSV(csvString).slice(0, 1000),
      status: "empty_no_user_contribs",
    };
  }

  return { stats: [], status: "empty_no_user_contribs" };
}

async function persistStatsToS3(
  s3Key: string,
  stats: RepoRawWeeklyStat[],
  repoOwner: string,
  repoName: string,
): Promise<void> {
  const validStats = stats.filter(
    (stat): stat is Required<RepoRawWeeklyStat> =>
      typeof stat.w === "number" &&
      typeof stat.a === "number" &&
      typeof stat.d === "number" &&
      typeof stat.c === "number",
  );

  if (validStats.length > 0) {
    await writeBinaryS3(s3Key, Buffer.from(generateGitHubStatsCSV(validStats)), "text/csv");
    debug(`[GitHub-Repo] CSV updated for ${repoOwner}/${repoName}: ${validStats.length} weeks`);
  } else {
    console.warn(`[GitHub-Repo] No valid stats for ${repoOwner}/${repoName}`);
  }
}

function accumulateWeeklyStats(
  stats: RepoRawWeeklyStat[],
  trailingYearFromDate: Date,
  now: Date,
): {
  yearAdded: number;
  yearRemoved: number;
  olderCommits: number;
  olderAdded: number;
  olderRemoved: number;
} {
  let yearAdded = 0;
  let yearRemoved = 0;
  let olderCommits = 0;
  let olderAdded = 0;
  let olderRemoved = 0;

  for (const week of stats) {
    const weekDate = unixToDate(week.w);
    if (weekDate >= trailingYearFromDate && weekDate <= now) {
      yearAdded += week.a || 0;
      yearRemoved += week.d || 0;
    } else if (weekDate < trailingYearFromDate) {
      olderCommits += week.c || 0;
      olderAdded += week.a || 0;
      olderRemoved += week.d || 0;
    }
  }

  return { yearAdded, yearRemoved, olderCommits, olderAdded, olderRemoved };
}

export async function processSingleRepository({
  repo,
  githubRepoOwner,
  trailingYearFromDate,
  now,
}: SingleRepoProcessingInput): Promise<SingleRepoProcessingResult> {
  const repoOwner = repo.owner.login;
  const repoName = repo.name;
  const s3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}_${repoName}.csv`;

  let stats: RepoRawWeeklyStat[] = [];
  let status: RepoWeeklyStatCache["status"] = "fetch_error";
  let dataComplete = true;

  try {
    const result = await fetchOrLoadRepoStats(repoOwner, repoName, githubRepoOwner, s3Key);
    stats = result.stats;
    status = result.status;

    if (stats.length > 0) {
      await persistStatsToS3(s3Key, stats, repoOwner, repoName);
    } else if (isErrorOrPendingStatus(status)) {
      console.warn(`[GitHub-Repo] No data for ${repoOwner}/${repoName} (status: ${status})`);
      dataComplete = false;
    }
  } catch (error: unknown) {
    if (error instanceof GitHubContributorStatsPendingError) {
      status = "pending_202_from_api";
      dataComplete = false;
      console.warn(`[GitHub-Repo] Stats generating for ${repoOwner}/${repoName}`);
    } else if (error instanceof GitHubContributorStatsRateLimitError) {
      status = "pending_rate_limit";
      dataComplete = false;
      console.warn(`[GitHub-Repo] Rate limited for ${repoOwner}/${repoName}`);
    } else {
      const categorized = createCategorizedError(error, "github");
      console.warn(`[GitHub-Repo] Error for ${repoOwner}/${repoName}:`, categorized.message);
      status = "fetch_error";
      dataComplete = false;
    }
  }

  const accumulated = accumulateWeeklyStats(stats, trailingYearFromDate, now);
  const hasAllTimeData = stats.length > 0;

  let allTimeLinesAdded = 0;
  let allTimeLinesRemoved = 0;
  if (hasAllTimeData) {
    for (const week of stats) {
      allTimeLinesAdded += week.a || 0;
      allTimeLinesRemoved += week.d || 0;
    }
  }

  return {
    yearLinesAdded: accumulated.yearAdded,
    yearLinesRemoved: accumulated.yearRemoved,
    allTimeLinesAdded,
    allTimeLinesRemoved,
    olderThanYearCommits: accumulated.olderCommits,
    olderThanYearLinesAdded: accumulated.olderAdded,
    olderThanYearLinesRemoved: accumulated.olderRemoved,
    dataComplete,
    hasAllTimeData,
  };
}
