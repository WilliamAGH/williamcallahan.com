/**
 * GitHub Data Processing Module
 *
 * Handles processing, aggregation, and transformation of GitHub activity data
 * Includes contribution mapping, weekly aggregation, and CSV repair functions
 *
 * @module data-access/github-processing
 */

import { parseGitHubStatsCSV, generateGitHubStatsCSV } from "@/lib/utils/csv";
import { formatISODate, unixToDate, isDateInRange } from "@/lib/utils/date-format";
import type {
  RepoRawWeeklyStat,
  AggregatedWeeklyActivity,
  GithubContributorStatsEntry,
  GitHubActivitySummary,
} from "@/types/github";
import { debug } from "@/lib/utils/debug";
import { readBinaryS3 } from "@/lib/s3/binary";
import { listRepoStatsFiles, writeAggregatedWeeklyActivityToS3 } from "./github-storage";
import {
  AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
  REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
} from "@/lib/constants";

/**
 * Creates an empty category stats object for LOC tracking
 * @see {@link src/lib/data-access/github-processing.ts} - Single source of truth
 */
export function createEmptyCategoryStats(): GitHubActivitySummary["linesOfCodeByCategory"] {
  return {
    frontend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    backend: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    dataEngineer: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
    other: { linesAdded: 0, linesRemoved: 0, netChange: 0, repoCount: 0 },
  };
}

// Type-safe global override declarations
declare global {
  var calculateAndStoreAggregatedWeeklyActivityOverride:
    | (() => Promise<{
        aggregatedActivity: AggregatedWeeklyActivity[];
        overallDataComplete: boolean;
      } | null>)
    | undefined;
}

/**
 * Calculate lines of code from weekly stats
 */
export function calculateLinesOfCode(
  weeklyStats: RepoRawWeeklyStat[],
  startDate?: Date,
  endDate?: Date,
): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const week of weeklyStats) {
    const weekDate = unixToDate(week.w);

    if (startDate && endDate && !isDateInRange(weekDate, startDate, endDate)) {
      continue;
    }

    linesAdded += week.a;
    linesRemoved += week.d;
  }

  return { linesAdded, linesRemoved };
}

/**
 * Filter contributor stats for specific user
 */
export function filterContributorStats(
  stats: GithubContributorStatsEntry[],
  username: string,
): GithubContributorStatsEntry | undefined {
  const lowercaseUsername = username.toLowerCase();
  return stats.find((stat) => stat.author.login.toLowerCase() === lowercaseUsername);
}

/**
 * Aggregate weekly stats across multiple repositories
 */
export function aggregateWeeklyStats(
  repoStats: Array<{ stats: RepoRawWeeklyStat[] }>,
): AggregatedWeeklyActivity[] {
  const weeklyMap = new Map<string, { linesAdded: number; linesRemoved: number }>();

  for (const repo of repoStats) {
    for (const week of repo.stats) {
      const weekDate = formatISODate(unixToDate(week.w));
      const existing = weeklyMap.get(weekDate) || { linesAdded: 0, linesRemoved: 0 };

      existing.linesAdded += week.a;
      existing.linesRemoved += week.d;

      weeklyMap.set(weekDate, existing);
    }
  }

  return Array.from(weeklyMap.entries())
    .map(([weekStartDate, stats]) => ({
      weekStartDate,
      ...stats,
    }))
    .toSorted((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));
}

/**
 * Categorize repository by type based on name patterns
 */
export function categorizeRepository(
  repoName: string,
): "frontend" | "backend" | "dataEngineer" | "other" {
  const name = repoName.toLowerCase();

  // Frontend patterns
  if (
    name.includes("frontend") ||
    name.includes("ui") ||
    name.includes("web") ||
    name.includes("react") ||
    name.includes("vue") ||
    name.includes("angular") ||
    name.includes("svelte") ||
    name.includes("nextjs") ||
    name.includes("client")
  ) {
    return "frontend";
  }

  // Backend patterns
  if (
    name.includes("backend") ||
    name.includes("api") ||
    name.includes("server") ||
    name.includes("service") ||
    name.includes("microservice") ||
    name.includes("node") ||
    name.includes("express") ||
    name.includes("fastapi")
  ) {
    return "backend";
  }

  // Data engineering patterns
  if (
    name.includes("data") ||
    name.includes("etl") ||
    name.includes("pipeline") ||
    name.includes("analytics") ||
    name.includes("ml") ||
    name.includes("ai") ||
    name.includes("spark") ||
    name.includes("airflow") ||
    name.includes("kafka")
  ) {
    return "dataEngineer";
  }

  return "other";
}

/** Default values for CSV repair operations */
const DEFAULT_CSV_REPAIR_VALUES = { w: 0, a: 0, d: 0, c: 0 };

/**
 * Repair CSV data by handling empty values
 */
export function repairCsvData(
  csvContent: string,
  defaultValues = DEFAULT_CSV_REPAIR_VALUES,
): string {
  const stats = parseGitHubStatsCSV(csvContent);

  // Check if repair is needed
  const needsRepair = stats.some((stat) =>
    Object.values(stat).some((val) => val === undefined || val === null),
  );

  if (!needsRepair) {
    return csvContent;
  }

  // Repair by filling in defaults
  const repaired = stats.map((stat) => ({
    w: stat.w ?? defaultValues.w,
    a: stat.a ?? defaultValues.a,
    d: stat.d ?? defaultValues.d,
    c: stat.c ?? defaultValues.c,
  }));

  return generateGitHubStatsCSV(repaired);
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
  const overrideCalc = globalThis.calculateAndStoreAggregatedWeeklyActivityOverride;
  if (typeof overrideCalc === "function") {
    return overrideCalc();
  }
  console.log("[DataAccess/GitHub-S3] Calculating aggregated weekly activity...");
  let overallDataComplete = true;
  const weeklyTotals: Record<string, { added: number; removed: number }> = {};
  const today = new Date();
  let s3StatFileKeys: string[] = [];
  try {
    console.log(
      `[DataAccess/GitHub-S3] Listing objects in S3 with prefix: ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/`,
    );
    s3StatFileKeys = await listRepoStatsFiles();
    debug(`[DataAccess/GitHub-S3] Found ${s3StatFileKeys.length} potential stat files in S3.`);
  } catch (listError: unknown) {
    const message = listError instanceof Error ? listError.message : String(listError);
    console.error(
      `[DataAccess/GitHub-S3] Aggregation: Error listing S3 objects in ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/:`,
      message,
    );
    await writeAggregatedWeeklyActivityToS3([]); // Write empty if listing fails
    return { aggregatedActivity: [], overallDataComplete: false };
  }
  s3StatFileKeys = s3StatFileKeys.filter((key) => key.endsWith(".csv"));
  if (s3StatFileKeys.length === 0) {
    debug(
      `[DataAccess/GitHub-S3] Aggregation: No raw weekly stat files found in S3 path ${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/. Nothing to aggregate.`,
    );
    await writeAggregatedWeeklyActivityToS3([]);
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
      // Use the CSV parser utility
      const csvString = buf.toString("utf-8");
      const stats = parseGitHubStatsCSV(csvString);
      for (const stat of stats) {
        const weekDate = unixToDate(stat.w);
        if (weekDate > today) continue; // Ignore future weeks if any
        const weekKey = weekDate.toISOString().split("T")[0];
        if (weekKey) {
          if (!weeklyTotals[weekKey]) {
            weeklyTotals[weekKey] = { added: 0, removed: 0 };
          }
          const totals = weeklyTotals[weekKey];
          if (totals) {
            totals.added += stat.a || 0;
            totals.removed += stat.d || 0;
          }
        }
      }
    } catch (err: unknown) {
      debug(
        `[DataAccess/GitHub-S3] Aggregation: Error reading ${repoStatS3Key}, skipping.`,
        err instanceof Error ? err.message : String(err),
      );
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
    .toSorted((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());
  await writeAggregatedWeeklyActivityToS3(aggregatedActivity);
  console.log(
    `[DataAccess/GitHub-S3] Aggregated weekly activity calculated and stored to ${AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE}. Total weeks aggregated: ${aggregatedActivity.length}. Overall data complete: ${overallDataComplete}`,
  );
  return { aggregatedActivity, overallDataComplete };
}
