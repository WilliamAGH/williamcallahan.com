/**
 * GitHub Activity Storage Module
 *
 * Delegates all persistence to PostgreSQL via Drizzle ORM.
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
import type { StoredGithubActivityRecord } from "@/types/github";
import type {
  AggregatedWeeklyActivityFromSchema,
  GitHubActivityApiResponseFromSchema,
  GitHubActivitySummaryFromSchema,
  RepoWeeklyStatCacheFromSchema,
} from "@/types/schemas/github-storage";

/**
 * Read GitHub activity data from the database.
 * All activity data lives in a single DB row keyed by ("activity", "global").
 */
export async function readGitHubActivityRecord(): Promise<GitHubActivityApiResponseFromSchema | null> {
  const data = await readGitHubActivityFromDb();
  if (!data) {
    debugLog("No GitHub activity data found in database", "warn");
  }
  return data;
}

/**
 * Write GitHub activity data with non-degrading write protection.
 */
export async function writeGitHubActivityRecord(
  data: GitHubActivityApiResponseFromSchema,
): Promise<boolean> {
  return writeGitHubActivityToDb(data);
}

/**
 * Read GitHub activity summary from the database.
 */
export async function readGitHubSummaryRecord(): Promise<GitHubActivitySummaryFromSchema | null> {
  return readGitHubSummaryFromDb();
}

/**
 * Write GitHub activity summary to the database.
 */
export async function writeGitHubSummaryRecord(
  summary: GitHubActivitySummaryFromSchema,
): Promise<boolean> {
  return writeGitHubSummaryToDb(summary);
}

/**
 * Read repository weekly stats cache from the database.
 */
export async function readRepoWeeklyStatsRecord(
  repoOwner: string,
  repoName: string,
): Promise<RepoWeeklyStatCacheFromSchema | null> {
  return readRepoWeeklyStatsFromDb(repoOwner, repoName);
}

/**
 * Write repository weekly stats cache to the database.
 */
export async function writeRepoWeeklyStatsRecord(
  repoOwner: string,
  repoName: string,
  cache: RepoWeeklyStatCacheFromSchema,
): Promise<boolean> {
  return writeRepoWeeklyStatsToDb(repoOwner, repoName, cache);
}

/**
 * Read aggregated weekly activity from the database.
 */
export async function readAggregatedWeeklyActivityRecord(): Promise<
  AggregatedWeeklyActivityFromSchema[] | null
> {
  return readAggregatedWeeklyActivityFromDb();
}

/**
 * Write aggregated weekly activity to the database.
 */
export async function writeAggregatedWeeklyActivityRecord(
  data: AggregatedWeeklyActivityFromSchema[],
): Promise<boolean> {
  return writeAggregatedWeeklyActivityToDb(data);
}

/**
 * List all repository weekly stats qualifiers stored in the database.
 * Returns qualifiers in "owner/repo" format, sorted alphabetically.
 * Replaces object-store key listing for repo weekly stats.
 */
export async function listRepoStatsFiles(): Promise<string[]> {
  return listRepoWeeklyStatsQualifiers();
}

/**
 * Get metadata for GitHub activity data.
 * Returns the updatedAt timestamp from the database row.
 */
export async function getGitHubActivityMetadata(): Promise<{ lastModified?: Date } | null> {
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
export function isOldFlatStoredGithubActivityFormat(
  obj: unknown,
): obj is StoredGithubActivityRecord {
  if (!obj || typeof obj !== "object") return false;
  const activity = obj as Record<string, unknown>;

  return (
    typeof activity.source === "string" &&
    Array.isArray(activity.data) &&
    typeof activity.totalContributions === "number"
  );
}
