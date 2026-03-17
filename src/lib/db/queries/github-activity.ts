import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import {
  githubActivityStore,
  GITHUB_ACTIVITY_DATA_TYPES,
  GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
} from "@/lib/db/schema/github-activity";
import {
  aggregatedWeeklyActivityArraySchema,
  gitHubActivityApiResponseSchema,
  gitHubActivitySummarySchema,
  repoWeeklyStatCacheSchema,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivitySummary,
  type RepoWeeklyStatCache,
} from "@/types/schemas/github-storage";

/**
 * Read a single document from the github_activity_store table by dataType + qualifier.
 * Returns the raw payload (unvalidated) or null if no row exists.
 */
async function readPayload(
  dataType: (typeof GITHUB_ACTIVITY_DATA_TYPES)[number],
  qualifier: string = GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
): Promise<unknown | null> {
  const rows = await db
    .select({ payload: githubActivityStore.payload })
    .from(githubActivityStore)
    .where(
      and(eq(githubActivityStore.dataType, dataType), eq(githubActivityStore.qualifier, qualifier)),
    )
    .limit(1);

  const firstRow = rows[0];
  if (!firstRow) {
    return null;
  }

  return firstRow.payload;
}

/**
 * Read the updatedAt timestamp for a document by dataType + qualifier.
 */
export async function readGitHubActivityUpdatedAt(
  dataType: (typeof GITHUB_ACTIVITY_DATA_TYPES)[number],
  qualifier: string = GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
): Promise<number | null> {
  const rows = await db
    .select({ updatedAt: githubActivityStore.updatedAt })
    .from(githubActivityStore)
    .where(
      and(eq(githubActivityStore.dataType, dataType), eq(githubActivityStore.qualifier, qualifier)),
    )
    .limit(1);

  return rows[0]?.updatedAt ?? null;
}

/**
 * Read GitHub activity data (trailing year + cumulative all-time) from PostgreSQL.
 */
export async function readGitHubActivityFromDb(): Promise<GitHubActivityApiResponse | null> {
  const payload = await readPayload("activity");
  if (payload === null) {
    return null;
  }

  return gitHubActivityApiResponseSchema.parse(payload);
}

/**
 * Read GitHub activity summary from PostgreSQL.
 */
export async function readGitHubSummaryFromDb(): Promise<GitHubActivitySummary | null> {
  const payload = await readPayload("summary");
  if (payload === null) {
    return null;
  }

  return gitHubActivitySummarySchema.parse(payload);
}

/**
 * Read per-repo weekly stats cache from PostgreSQL.
 */
export async function readRepoWeeklyStatsFromDb(
  owner: string,
  repo: string,
): Promise<RepoWeeklyStatCache | null> {
  const qualifier = `${owner}/${repo}`;
  const payload = await readPayload("repo-weekly-stats", qualifier);
  if (payload === null) {
    return null;
  }

  return repoWeeklyStatCacheSchema.parse(payload);
}

/**
 * Read aggregated weekly activity array from PostgreSQL.
 */
export async function readAggregatedWeeklyActivityFromDb(): Promise<
  AggregatedWeeklyActivity[] | null
> {
  const payload = await readPayload("aggregated-weekly");
  if (payload === null) {
    return null;
  }

  return aggregatedWeeklyActivityArraySchema.parse(payload);
}

/**
 * Read the CSV checksum for a repo from the csv-checksum row.
 * Returns null when no checksum has been stored yet.
 */
export async function readRepoCsvChecksum(owner: string, repo: string): Promise<string | null> {
  const qualifier = `${owner}/${repo}`;
  const rows = await db
    .select({ checksum: githubActivityStore.checksum })
    .from(githubActivityStore)
    .where(
      and(
        eq(githubActivityStore.dataType, "csv-checksum"),
        eq(githubActivityStore.qualifier, qualifier),
      ),
    )
    .limit(1);

  return rows[0]?.checksum ?? null;
}

/**
 * List all repo-weekly-stats qualifiers (e.g. "owner/repo") stored in the DB.
 * Replaces the S3-based listRepoStatsFiles().
 */
export async function listRepoWeeklyStatsQualifiers(): Promise<string[]> {
  const rows = await db
    .select({ qualifier: githubActivityStore.qualifier })
    .from(githubActivityStore)
    .where(eq(githubActivityStore.dataType, "repo-weekly-stats"))
    .orderBy(githubActivityStore.qualifier);

  return rows.map((row) => row.qualifier);
}
