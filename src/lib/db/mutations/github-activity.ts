import { and, eq, sql } from "drizzle-orm";
import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import {
  githubActivityStore,
  GITHUB_ACTIVITY_DATA_TYPES,
  GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
} from "@/lib/db/schema/github-activity";
import { debugLog } from "@/lib/utils/debug";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  gitHubActivityApiResponseSchema,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivitySummary,
  type GitHubActivityWriteIntent,
  type RepoWeeklyStatCache,
} from "@/types/schemas/github-storage";

const GITHUB_ACTIVITY_REFRESH_LOCK = "github-activity-refresh-global";

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

  const ty = d.trailingYearData;
  const hasData = Array.isArray(ty?.data) && (ty?.data?.length ?? 0) > 0;
  const hasCount = typeof ty?.totalContributions === "number" && ty.totalContributions >= 0;
  const contributions = ty?.totalContributions ?? -1;
  const isDataComplete = ty?.dataComplete === true;

  const isEmpty = !hasData && contributions <= 0;
  const isIncomplete = !hasData || !hasCount || !isDataComplete;

  return { hasData, hasCount, contributions, isEmpty, isIncomplete, isComplete: !isIncomplete };
};

/** Apply non-degrading protection to an activity row read under the refresh transaction lock. */
function canPublishGitHubActivity(
  data: GitHubActivityApiResponse,
  intent: GitHubActivityWriteIntent,
  existing: GitHubActivityApiResponse | null,
): boolean {
  const newQ = classifyDataset(data);
  const replacesEmptyCurrentRepositorySet =
    intent === GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET;
  const isCompleteZeroSegment = (segment: GitHubActivitySegment): boolean =>
    segment.data.length === 0 &&
    segment.totalContributions === 0 &&
    segment.linesAdded === 0 &&
    segment.linesRemoved === 0 &&
    segment.dataComplete === true &&
    segment.allPriorYearCommits === undefined;
  const isExplicitEmptyCurrentRepositorySet =
    isCompleteZeroSegment(data.trailingYearData) &&
    isCompleteZeroSegment(data.cumulativeAllTimeData);

  if (replacesEmptyCurrentRepositorySet && !isExplicitEmptyCurrentRepositorySet) {
    throw new Error(
      "An empty-current-repository-set write must contain complete, zero-contribution activity data.",
    );
  }

  if (!replacesEmptyCurrentRepositorySet && newQ.isIncomplete) {
    const existingQ = classifyDataset(existing);
    const existingIsHealthy = !!existing && !existingQ.isEmpty;

    if (existingIsHealthy) {
      if (existingQ.isComplete) {
        debugLog("Non-degrading write: Preserving complete GitHub activity dataset", "warn", {
          newCount: Math.max(0, newQ.contributions),
        });
        return false;
      }

      const existingContributions = Math.max(0, existingQ.contributions);
      const newContributions = Math.max(0, newQ.contributions);

      if (newContributions <= existingContributions) {
        debugLog("Non-degrading write: Preserving existing dataset with more data", "warn", {
          existingCount: existingContributions,
          newCount: newContributions,
        });
        return false;
      }

      debugLog("Writing new data despite incomplete flag - has more contributions", "info", {
        oldCount: existingContributions,
        newCount: newContributions,
      });
    }
  }

  return true;
}

/** Persist the refresh's public activity, summary, and aggregate as one database commit. */
export async function writeGitHubActivityRefreshToDb(
  activity: GitHubActivityApiResponse,
  summary: GitHubActivitySummary,
  aggregatedActivity: AggregatedWeeklyActivity[],
  intent: GitHubActivityWriteIntent,
): Promise<boolean> {
  assertDatabaseWriteAllowed("writeGitHubActivityRefreshToDb");
  const published = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${GITHUB_ACTIVITY_REFRESH_LOCK}))`);
    const existingRows = await tx
      .select({ payload: githubActivityStore.payload })
      .from(githubActivityStore)
      .where(
        and(
          eq(githubActivityStore.dataType, "activity"),
          eq(githubActivityStore.qualifier, GITHUB_ACTIVITY_GLOBAL_QUALIFIER),
        ),
      )
      .limit(1);
    const existingPayload = existingRows[0]?.payload;
    const existingActivity =
      existingPayload === undefined ? null : gitHubActivityApiResponseSchema.parse(existingPayload);
    if (!canPublishGitHubActivity(activity, intent, existingActivity)) {
      return false;
    }

    const updatedAt = Date.now();
    await tx
      .insert(githubActivityStore)
      .values([
        {
          dataType: "activity",
          qualifier: GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
          payload: activity,
          updatedAt,
        },
        {
          dataType: "summary",
          qualifier: GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
          payload: summary,
          updatedAt,
        },
        {
          dataType: "aggregated-weekly",
          qualifier: GITHUB_ACTIVITY_GLOBAL_QUALIFIER,
          payload: aggregatedActivity,
          updatedAt,
        },
      ])
      .onConflictDoUpdate({
        target: [githubActivityStore.dataType, githubActivityStore.qualifier],
        set: { payload: sql`excluded.payload`, updatedAt },
      });
    return true;
  });
  if (published) {
    debugLog("Successfully wrote the GitHub activity refresh to DB", "info");
  }
  return published;
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
