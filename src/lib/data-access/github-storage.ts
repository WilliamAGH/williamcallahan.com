/**
 * GitHub S3 Storage Module
 *
 * Handles all S3 storage operations for GitHub activity data
 * Includes caching, CSV repair, and data persistence
 *
 * @module data-access/github-storage
 */

import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { getS3ObjectMetadata, listS3Objects } from "@/lib/s3/objects";

import { debugLog } from "@/lib/utils/debug";
import {
  GITHUB_ACTIVITY_S3_KEY_FILE,
  GITHUB_STATS_SUMMARY_S3_KEY_FILE,
  REPO_RAW_WEEKLY_STATS_S3_KEY_DIR,
  AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
} from "@/lib/constants";
import type { StoredGithubActivityS3 } from "@/types/github";
import {
  aggregatedWeeklyActivityArraySchema,
  gitHubActivityApiResponseSchema,
  gitHubActivitySummarySchema,
  repoWeeklyStatCacheSchema,
  type AggregatedWeeklyActivityFromSchema,
  type GitHubActivityApiResponseFromSchema,
  type GitHubActivitySummaryFromSchema,
  type RepoWeeklyStatCacheFromSchema,
} from "@/types/schemas/github-storage";

/**
 * Read GitHub activity data from S3
 */
export async function readGitHubActivityFromS3(
  key: string = GITHUB_ACTIVITY_S3_KEY_FILE,
): Promise<GitHubActivityApiResponseFromSchema | null> {
  const data = await readJsonS3Optional<GitHubActivityApiResponseFromSchema>(
    key,
    gitHubActivityApiResponseSchema,
  );
  if (!data) {
    debugLog(`No GitHub activity data found at ${key}`, "warn");
  }
  return data;
}

// Classify dataset quality to support non-degrading writes
const classifyDataset = (d: GitHubActivityApiResponseFromSchema | null | undefined) => {
  if (!d) {
    return {
      hasData: false,
      hasCount: false,
      contributions: -1,
      isEmpty: true,
      isIncomplete: true,
    };
  }

  const ty = d.trailingYearData as
    | { data?: unknown[]; dataComplete?: boolean; totalContributions?: number }
    | undefined;
  const hasData = Array.isArray(ty?.data) && (ty?.data?.length ?? 0) > 0;
  const hasCount = typeof ty?.totalContributions === "number" && ty.totalContributions >= 0;
  const contributions = ty?.totalContributions ?? -1;
  const isDataComplete = ty?.dataComplete === true;

  // Empty = no trailing year data at all, or empty array
  const isEmpty = !hasData && contributions <= 0;

  // Incomplete = missing key fields or explicitly marked incomplete
  const isIncomplete = !hasData || !hasCount || !isDataComplete;

  return { hasData, hasCount, contributions, isEmpty, isIncomplete };
};

/**
 * Write GitHub activity data to S3
 */
export async function writeGitHubActivityToS3(
  data: GitHubActivityApiResponseFromSchema,
  key: string = GITHUB_ACTIVITY_S3_KEY_FILE,
): Promise<boolean> {
  // Non-degrading write: avoid overwriting a healthy dataset with empty/incomplete results
  const newQ = classifyDataset(data);
  if (newQ.isIncomplete) {
    const existing = await readGitHubActivityFromS3(key);
    const existingQ = classifyDataset(existing);
    const existingIsHealthy = !!existing && !existingQ.isEmpty;

    if (existingIsHealthy) {
      const existingContributions = Math.max(0, existingQ.contributions);
      const newContributions = Math.max(0, newQ.contributions);

      if (newContributions <= existingContributions) {
        debugLog(`Non-degrading write: Preserving existing dataset with more data`, "warn", {
          key,
          existingCount: existingContributions,
          newCount: newContributions,
        });
        return true;
      }

      debugLog(`Writing new data despite incomplete flag - has more contributions`, "info", {
        key,
        oldCount: existingContributions,
        newCount: newContributions,
      });
    }
  }

  await writeJsonS3(key, data);
  debugLog(`Successfully wrote GitHub activity to S3`, "info", { key });
  return true;
}

/**
 * Read GitHub activity summary from S3
 */
export async function readGitHubSummaryFromS3(): Promise<GitHubActivitySummaryFromSchema | null> {
  return readJsonS3Optional<GitHubActivitySummaryFromSchema>(
    GITHUB_STATS_SUMMARY_S3_KEY_FILE,
    gitHubActivitySummarySchema,
  );
}

/**
 * Write GitHub activity summary to S3
 */
export async function writeGitHubSummaryToS3(
  summary: GitHubActivitySummaryFromSchema,
): Promise<boolean> {
  await writeJsonS3(GITHUB_STATS_SUMMARY_S3_KEY_FILE, summary);
  debugLog(`Successfully wrote GitHub summary to S3`, "info");
  return true;
}

/**
 * Read repository weekly stats cache from S3
 */
export async function readRepoWeeklyStatsFromS3(
  repoOwner: string,
  repoName: string,
): Promise<RepoWeeklyStatCacheFromSchema | null> {
  const s3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}/${repoName}.json`;
  return readJsonS3Optional<RepoWeeklyStatCacheFromSchema>(s3Key, repoWeeklyStatCacheSchema);
}

/**
 * Write repository weekly stats cache to S3
 */
export async function writeRepoWeeklyStatsToS3(
  repoOwner: string,
  repoName: string,
  cache: RepoWeeklyStatCacheFromSchema,
): Promise<boolean> {
  const s3Key = `${REPO_RAW_WEEKLY_STATS_S3_KEY_DIR}/${repoOwner}/${repoName}.json`;
  await writeJsonS3(s3Key, cache);
  debugLog(`Successfully wrote repo weekly stats to S3`, "info", { s3Key });
  return true;
}

/**
 * Read aggregated weekly activity from S3
 */
export async function readAggregatedWeeklyActivityFromS3(): Promise<
  AggregatedWeeklyActivityFromSchema[] | null
> {
  return readJsonS3Optional<AggregatedWeeklyActivityFromSchema[]>(
    AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE,
    aggregatedWeeklyActivityArraySchema,
  );
}

/**
 * Write aggregated weekly activity to S3
 */
export async function writeAggregatedWeeklyActivityToS3(
  data: AggregatedWeeklyActivityFromSchema[],
): Promise<boolean> {
  await writeJsonS3(AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE, data);
  debugLog(`Successfully wrote aggregated weekly activity to S3`, "info");
  return true;
}

/**
 * List all repository stats files in S3
 */
export async function listRepoStatsFiles(): Promise<string[]> {
  const results = await listS3Objects(REPO_RAW_WEEKLY_STATS_S3_KEY_DIR);
  return results.filter((key) => key.endsWith(".json")).toSorted();
}

/**
 * Get metadata for GitHub activity file
 */
export async function getGitHubActivityMetadata(
  key: string = GITHUB_ACTIVITY_S3_KEY_FILE,
): Promise<{
  lastModified?: Date;
} | null> {
  const metadata = await getS3ObjectMetadata(key);
  return metadata
    ? {
        lastModified: metadata.lastModified,
      }
    : null;
}

/**
 * Check if old format stored GitHub activity
 */
export function isOldFlatStoredGithubActivityS3Format(obj: unknown): obj is StoredGithubActivityS3 {
  if (!obj || typeof obj !== "object") return false;
  const activity = obj as Record<string, unknown>;

  return (
    typeof activity.source === "string" &&
    Array.isArray(activity.data) &&
    typeof activity.totalContributions === "number"
  );
}
