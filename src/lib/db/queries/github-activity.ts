import * as Sentry from "@sentry/nextjs";
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
  executor: Pick<typeof db, "select">,
  dataType: (typeof GITHUB_ACTIVITY_DATA_TYPES)[number],
  qualifier: string = GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
): Promise<unknown | null> {
  const rows = await executor
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
export async function readGitHubActivityFromDb(
  executor: Pick<typeof db, "select"> = db,
): Promise<GitHubActivityApiResponse | null> {
  const payload = await readPayload(executor, "activity");
  if (payload === null) {
    return null;
  }

  return gitHubActivityApiResponseSchema.parse(payload);
}

/**
 * Read the prior activity only as a transaction-locked refresh precondition.
 * Invalid persisted data is reported without its payload so a validated refresh can repair the row.
 */
export async function readGitHubActivityRefreshPreconditionFromDb(
  executor: Pick<typeof db, "select">,
): Promise<GitHubActivityApiResponse | null> {
  const payload = await readPayload(executor, "activity");
  if (payload === null) {
    return null;
  }

  const parsed = gitHubActivityApiResponseSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const firstIssues = parsed.error.issues.slice(0, 3);
  Sentry.captureMessage("Stored GitHub activity payload failed schema validation", {
    level: "error",
    tags: {
      feature: "github-activity-refresh",
      integrity: "invalid-persisted-activity",
    },
    extra: {
      dataType: "activity",
      qualifier: GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
      issueCount: parsed.error.issues.length,
      issueCodes: firstIssues.map((issue) => issue.code),
      issuePaths: firstIssues.map((issue) =>
        issue.path.length === 0 ? "<root>" : issue.path.map(String).join("."),
      ),
    },
  });
  return null;
}

/**
 * Read GitHub activity summary from PostgreSQL.
 */
export async function readGitHubSummaryFromDb(): Promise<GitHubActivitySummary | null> {
  const payload = await readPayload(db, "summary");
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
  const payload = await readPayload(db, "repo-weekly-stats", qualifier);
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
  const payload = await readPayload(db, "aggregated-weekly");
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
