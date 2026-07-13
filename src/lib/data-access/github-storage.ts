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
} from "@/lib/db/queries/github-activity";
import {
  writeGitHubActivityRefreshToDb,
  writeRepoWeeklyStatsToDb,
} from "@/lib/db/mutations/github-activity";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  aggregatedWeeklyActivityArraySchema,
  gitHubActivityApiResponseSchema,
  gitHubActivitySummarySchema,
} from "@/types/schemas/github-storage";
import type {
  AggregatedWeeklyActivity,
  GitHubActivityApiResponse,
  GitHubActivitySummary,
  GitHubActivityWriteIntent,
  RepoWeeklyStatCache,
} from "@/types/schemas/github-storage";

/**
 * Read GitHub activity data from the database.
 * All activity data lives in a single DB row keyed by ("activity", "global").
 */
export async function readGitHubActivityRecord(): Promise<GitHubActivityApiResponse | null> {
  const activityRecord = await readGitHubActivityFromDb();
  if (!activityRecord) {
    debugLog("No GitHub activity data found in database", "warn");
  }
  return activityRecord;
}

/** Validate and atomically persist every public record produced by one GitHub refresh. */
export async function writeGitHubActivityRefreshRecord(
  activity: GitHubActivityApiResponse,
  summary: GitHubActivitySummary,
  aggregatedActivity: AggregatedWeeklyActivity[],
  intent: GitHubActivityWriteIntent = GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
): Promise<boolean> {
  return writeGitHubActivityRefreshToDb(
    gitHubActivityApiResponseSchema.parse(activity),
    gitHubActivitySummarySchema.parse(summary),
    aggregatedWeeklyActivityArraySchema.parse(aggregatedActivity),
    intent,
  );
}

/**
 * Read GitHub activity summary from the database.
 */
export async function readGitHubSummaryRecord(): Promise<GitHubActivitySummary | null> {
  return readGitHubSummaryFromDb();
}

/**
 * Read repository weekly stats cache from the database.
 */
export async function readRepoWeeklyStatsRecord(
  repoOwner: string,
  repoName: string,
): Promise<RepoWeeklyStatCache | null> {
  return readRepoWeeklyStatsFromDb(repoOwner, repoName);
}

/**
 * Write repository weekly stats cache to the database.
 */
export async function writeRepoWeeklyStatsRecord(
  repoOwner: string,
  repoName: string,
  cache: RepoWeeklyStatCache,
): Promise<boolean> {
  return writeRepoWeeklyStatsToDb(repoOwner, repoName, cache);
}

/**
 * Read aggregated weekly activity from the database.
 */
export async function readAggregatedWeeklyActivityRecord(): Promise<
  AggregatedWeeklyActivity[] | null
> {
  return readAggregatedWeeklyActivityFromDb();
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
