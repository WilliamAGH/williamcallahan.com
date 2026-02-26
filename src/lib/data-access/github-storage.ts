/**
 * GitHub Activity Storage Module
 *
 * Delegates all persistence to PostgreSQL via Drizzle ORM.
 * Exported function signatures are intentionally preserved for call-site compatibility.
 *
 * @module data-access/github-storage
 */

import { debugLog } from "@/lib/utils/debug";
import {
  readGitHubActivityFromDb,
  readGitHubSummaryFromDb,
  readRepoWeeklyStatsFromDb,
  readAggregatedWeeklyActivityFromDb,
  readGitHubActivityUpdatedAt,
  listRepoWeeklyStatsQualifiers,
} from "@/lib/db/queries/github-activity";
import {
  writeGitHubActivityToDb,
  writeGitHubSummaryToDb,
  writeRepoWeeklyStatsToDb,
  writeAggregatedWeeklyActivityToDb,
} from "@/lib/db/mutations/github-activity";
import type { StoredGithubActivityS3 } from "@/types/github";
import type {
  AggregatedWeeklyActivityFromSchema,
  GitHubActivityApiResponseFromSchema,
  GitHubActivitySummaryFromSchema,
  RepoWeeklyStatCacheFromSchema,
} from "@/types/schemas/github-storage";

/**
 * Read GitHub activity data from the database.
 * The `_key` parameter is accepted for call-site compatibility but is not used;
 * all activity data lives in a single DB row keyed by ("activity", "global").
 */
export async function readGitHubActivityFromS3(
  _key?: string,
): Promise<GitHubActivityApiResponseFromSchema | null> {
  const data = await readGitHubActivityFromDb();
  if (!data) {
    debugLog("No GitHub activity data found in database", "warn");
  }
  return data;
}

/**
 * Write GitHub activity data with non-degrading write protection.
 * The `_key` parameter is accepted for call-site compatibility but is not used.
 */
export async function writeGitHubActivityToS3(
  data: GitHubActivityApiResponseFromSchema,
  _key?: string,
): Promise<boolean> {
  return writeGitHubActivityToDb(data);
}

/**
 * Read GitHub activity summary from the database.
 */
export async function readGitHubSummaryFromS3(): Promise<GitHubActivitySummaryFromSchema | null> {
  return readGitHubSummaryFromDb();
}

/**
 * Write GitHub activity summary to the database.
 */
export async function writeGitHubSummaryToS3(
  summary: GitHubActivitySummaryFromSchema,
): Promise<boolean> {
  return writeGitHubSummaryToDb(summary);
}

/**
 * Read repository weekly stats cache from the database.
 */
export async function readRepoWeeklyStatsFromS3(
  repoOwner: string,
  repoName: string,
): Promise<RepoWeeklyStatCacheFromSchema | null> {
  return readRepoWeeklyStatsFromDb(repoOwner, repoName);
}

/**
 * Write repository weekly stats cache to the database.
 */
export async function writeRepoWeeklyStatsToS3(
  repoOwner: string,
  repoName: string,
  cache: RepoWeeklyStatCacheFromSchema,
): Promise<boolean> {
  return writeRepoWeeklyStatsToDb(repoOwner, repoName, cache);
}

/**
 * Read aggregated weekly activity from the database.
 */
export async function readAggregatedWeeklyActivityFromS3(): Promise<
  AggregatedWeeklyActivityFromSchema[] | null
> {
  return readAggregatedWeeklyActivityFromDb();
}

/**
 * Write aggregated weekly activity to the database.
 */
export async function writeAggregatedWeeklyActivityToS3(
  data: AggregatedWeeklyActivityFromSchema[],
): Promise<boolean> {
  return writeAggregatedWeeklyActivityToDb(data);
}

/**
 * List all repository weekly stats qualifiers stored in the database.
 * Returns qualifiers in "owner/repo" format, sorted alphabetically.
 * Replaces the S3-based file listing.
 */
export async function listRepoStatsFiles(): Promise<string[]> {
  return listRepoWeeklyStatsQualifiers();
}

/**
 * Get metadata for GitHub activity data.
 * Returns the updatedAt timestamp from the database row.
 */
export async function getGitHubActivityMetadata(
  _key?: string,
): Promise<{ lastModified?: Date } | null> {
  const updatedAt = await readGitHubActivityUpdatedAt("activity");
  if (updatedAt === null) {
    return null;
  }

  return { lastModified: new Date(updatedAt) };
}

/**
 * Check if an object uses the old flat stored GitHub activity format.
 * Retained for backward compatibility in consumers that handle legacy data shapes.
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
