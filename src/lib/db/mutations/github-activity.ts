import { and, eq } from "drizzle-orm";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import {
  githubActivityStore,
  GITHUB_ACTIVITY_DATA_TYPES,
  GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
} from "@/lib/db/schema/github-activity";
import { readGitHubActivityFromDb } from "@/lib/db/queries/github-activity";
import { debugLog } from "@/lib/utils/debug";
import type {
  AggregatedWeeklyActivity,
  GitHubActivityApiResponse,
  GitHubActivitySummary,
  RepoWeeklyStatCache,
} from "@/types/schemas/github-storage";

/**
 * Upsert a document into the github_activity_store table.
 */
async function upsertDocument(
  dataType: (typeof GITHUB_ACTIVITY_DATA_TYPES)[number],
  qualifier: string,
  payload: unknown,
): Promise<void> {
  const updatedAt = Date.now();

  await db
    .insert(githubActivityStore)
    .values({ dataType, qualifier, payload, updatedAt })
    .onConflictDoUpdate({
      target: [githubActivityStore.dataType, githubActivityStore.qualifier],
      set: { payload, updatedAt },
    });
}

// ---------------------------------------------------------------------------
// Non-degrading write logic (moved from github-storage.ts)
// ---------------------------------------------------------------------------

/** Classify dataset quality to protect against overwriting healthy data with empty/incomplete results. */
const classifyDataset = (d: GitHubActivityApiResponse | null | undefined) => {
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

  const isEmpty = !hasData && contributions <= 0;
  const isIncomplete = !hasData || !hasCount || !isDataComplete;

  return { hasData, hasCount, contributions, isEmpty, isIncomplete };
};

/**
 * Write GitHub activity data to PostgreSQL with non-degrading write protection.
 * Avoids overwriting a healthy dataset with empty/incomplete results.
 */
export async function writeGitHubActivityToDb(data: GitHubActivityApiResponse): Promise<boolean> {
  assertDatabaseWriteAllowed("writeGitHubActivityToDb");

  const newQ = classifyDataset(data);
  if (newQ.isIncomplete) {
    const existing = await readGitHubActivityFromDb();
    const existingQ = classifyDataset(existing);
    const existingIsHealthy = !!existing && !existingQ.isEmpty;

    if (existingIsHealthy) {
      const existingContributions = Math.max(0, existingQ.contributions);
      const newContributions = Math.max(0, newQ.contributions);

      if (newContributions <= existingContributions) {
        debugLog("Non-degrading write: Preserving existing dataset with more data", "warn", {
          existingCount: existingContributions,
          newCount: newContributions,
        });
        return true;
      }

      debugLog("Writing new data despite incomplete flag - has more contributions", "info", {
        oldCount: existingContributions,
        newCount: newContributions,
      });
    }
  }

  await upsertDocument("activity", GITHUB_ACTIVITY_GLOBAL_QUALIFIER, data);
  debugLog("Successfully wrote GitHub activity to DB", "info");
  return true;
}

/**
 * Write GitHub activity summary to PostgreSQL.
 */
export async function writeGitHubSummaryToDb(summary: GitHubActivitySummary): Promise<boolean> {
  assertDatabaseWriteAllowed("writeGitHubSummaryToDb");

  await upsertDocument("summary", GITHUB_ACTIVITY_GLOBAL_QUALIFIER, summary);
  debugLog("Successfully wrote GitHub summary to DB", "info");
  return true;
}

/**
 * Write per-repo weekly stats cache to PostgreSQL.
 */
export async function writeRepoWeeklyStatsToDb(
  owner: string,
  repo: string,
  cache: RepoWeeklyStatCache,
): Promise<boolean> {
  assertDatabaseWriteAllowed("writeRepoWeeklyStatsToDb");

  const qualifier = `${owner}/${repo}`;
  await upsertDocument("repo-weekly-stats", qualifier, cache);
  debugLog("Successfully wrote repo weekly stats to DB", "info", { qualifier });
  return true;
}

/**
 * Write aggregated weekly activity to PostgreSQL.
 */
export async function writeAggregatedWeeklyActivityToDb(
  data: AggregatedWeeklyActivity[],
): Promise<boolean> {
  assertDatabaseWriteAllowed("writeAggregatedWeeklyActivityToDb");

  await upsertDocument("aggregated-weekly", GITHUB_ACTIVITY_GLOBAL_QUALIFIER, data);
  debugLog("Successfully wrote aggregated weekly activity to DB", "info");
  return true;
}

/**
 * Write the CSV checksum for a repo to the csv-checksum row.
 * Uses upsert so the row is created on first write.
 */
export async function writeRepoCsvChecksumToDb(
  owner: string,
  repo: string,
  checksum: string,
): Promise<void> {
  assertDatabaseWriteAllowed("writeRepoCsvChecksumToDb");

  const qualifier = `${owner}/${repo}`;
  const updatedAt = Date.now();

  await db
    .insert(githubActivityStore)
    .values({
      dataType: "csv-checksum",
      qualifier,
      payload: { checksum },
      checksum,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: [githubActivityStore.dataType, githubActivityStore.qualifier],
      set: { payload: { checksum }, checksum, updatedAt },
    });
}

/**
 * Delete a per-repo weekly stats entry.
 */
export async function deleteRepoWeeklyStatsFromDb(owner: string, repo: string): Promise<void> {
  assertDatabaseWriteAllowed("deleteRepoWeeklyStatsFromDb");

  const qualifier = `${owner}/${repo}`;
  await db
    .delete(githubActivityStore)
    .where(
      and(
        eq(githubActivityStore.dataType, "repo-weekly-stats"),
        eq(githubActivityStore.qualifier, qualifier),
      ),
    );
}
