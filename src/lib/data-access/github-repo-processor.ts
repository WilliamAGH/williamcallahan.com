/**
 * Single repository stats processor
 * @module data-access/github-repo-processor
 */

import { debug } from "@/lib/utils/debug";
import { unixToDate } from "@/lib/utils/date-format";
import { createCategorizedError } from "@/lib/utils/error-utils";
import { filterContributorStats } from "./github-processing";
import {
  fetchContributorStats,
  GitHubContributorStatsPendingError,
  GitHubContributorStatsRateLimitError,
} from "./github-api";
import { readRepoWeeklyStatsRecord, writeRepoWeeklyStatsRecord } from "./github-storage";
import type { RepoRawWeeklyStat, RepoWeeklyStatCache } from "@/types/schemas/github-storage";
import {
  isErrorOrPendingStatus,
  type SingleRepoProcessingInput,
  type SingleRepoProcessingResult,
} from "@/types/features/github-processing";

async function fetchOrLoadRepoStats(
  repoOwner: string,
  repoName: string,
  githubRepoOwner: string,
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

  // No API data - use PostgreSQL cache snapshot
  const dbCache = await readRepoWeeklyStatsRecord(repoOwner, repoName);
  if (dbCache && Array.isArray(dbCache.stats) && dbCache.stats.length > 0) {
    debug(`[GitHub-Repo] Using DB cache for ${repoOwner}/${repoName}`);
    return { stats: dbCache.stats.toSorted((a, b) => a.w - b.w), status: dbCache.status };
  }

  return { stats: [], status: "empty_no_user_contribs" };
}

function filterValidStats(stats: RepoRawWeeklyStat[]): Required<RepoRawWeeklyStat>[] {
  return stats.filter(
    (stat): stat is Required<RepoRawWeeklyStat> =>
      typeof stat.w === "number" &&
      typeof stat.a === "number" &&
      typeof stat.d === "number" &&
      typeof stat.c === "number",
  );
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

  let stats: RepoRawWeeklyStat[] = [];
  let status: RepoWeeklyStatCache["status"] = "fetch_error";
  let dataComplete = true;

  try {
    const result = await fetchOrLoadRepoStats(repoOwner, repoName, githubRepoOwner);
    stats = result.stats;
    status = result.status;

    if (stats.length > 0) {
      const validStats = filterValidStats(stats);
      await writeRepoWeeklyStatsRecord(repoOwner, repoName, {
        repoOwnerLogin: repoOwner,
        repoName,
        lastFetched: now.toISOString(),
        status,
        stats: validStats,
      });
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
