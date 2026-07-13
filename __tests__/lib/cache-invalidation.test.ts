vi.mock("@/lib/data-access/github-public-api");

import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createGitHubActivitySummary } from "@/lib/data-access/github-activity-summaries";
import { createEmptyCategoryStats } from "@/lib/data-access/github-processing";
import type { GraphQLRepoNode } from "@/types/github";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  aggregatedWeeklyActivityArraySchema,
  gitHubActivityApiResponseSchema,
  gitHubActivitySummarySchema,
  publicPriorYearCommitSummarySchema,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivityWriteIntent,
  type PriorYearCommitSummary,
} from "@/types/schemas/github-storage";

const GITHUB_ACTIVITY_LOCK_EVENT =
  "select pg_advisory_xact_lock(hashtext($1)) [github-activity-refresh-global]";
const pgDialect = new PgDialect();

const buildGitHubSegment = (
  overrides: Partial<GitHubActivitySegment> = {},
): GitHubActivitySegment => ({
  source: "api",
  data: [],
  totalContributions: 12,
  linesAdded: 120,
  linesRemoved: 30,
  dataComplete: true,
  ...overrides,
});

const buildGitHubActivity = (
  overrides: Partial<GitHubActivitySegment> = {},
): GitHubActivityApiResponse => ({
  trailingYearData: buildGitHubSegment(overrides),
  cumulativeAllTimeData: buildGitHubSegment(overrides),
});

const readGithubActivityView = async (record: GitHubActivityApiResponse, lastModified?: Date) => {
  vi.resetModules();
  vi.doMock("@/lib/data-access/github-storage", () => ({
    readGitHubActivityRecord: () => Promise.resolve(record),
    getGitHubActivityMetadata: () => Promise.resolve(lastModified ? { lastModified } : null),
  }));

  try {
    const actual = await vi.importActual<typeof import("@/lib/data-access/github-public-api")>(
      "@/lib/data-access/github-public-api",
    );
    return actual.getGithubActivity();
  } finally {
    vi.doUnmock("@/lib/data-access/github-storage");
  }
};

const loadGitHubActivityWriter = async (
  initialActivity: GitHubActivityApiResponse,
  rejectInsert = false,
) => {
  vi.resetModules();
  const initialRefresh = {
    activity: initialActivity,
    summary: createGitHubActivitySummary({
      allTimeData: initialActivity.cumulativeAllTimeData,
      totalRepositoriesContributedTo: 4,
      linesOfCodeByCategory: createEmptyCategoryStats(),
    }),
    aggregatedActivity: [{ weekStartDate: "2026-06-02", linesAdded: 90, linesRemoved: 20 }],
  };
  let storedRefresh = initialRefresh;
  const transactionEvents: string[] = [];
  const transactionExecutor = {
    execute: (query: SQL) => {
      const renderedQuery = pgDialect.sqlToQuery(query);
      transactionEvents.push(`${renderedQuery.sql} [${renderedQuery.params.join(",")}]`);
      return Promise.resolve();
    },
    select: () => {
      transactionEvents.push("read");
      return {
        from: () => ({
          where: () => ({ limit: async () => [{ payload: storedRefresh.activity }] }),
        }),
      };
    },
    insert: () => {
      transactionEvents.push("write");
      return {
        values: (records: Array<{ dataType: string; payload: unknown }>) => ({
          onConflictDoUpdate: async () => {
            if (rejectInsert) throw new Error("atomic insert failed");
            const payloads = Object.fromEntries(
              records.map(({ dataType, payload }) => [dataType, payload]),
            );
            storedRefresh = {
              activity: gitHubActivityApiResponseSchema.parse(payloads.activity),
              summary: gitHubActivitySummarySchema.parse(payloads.summary),
              aggregatedActivity: aggregatedWeeklyActivityArraySchema.parse(
                payloads["aggregated-weekly"],
              ),
            };
          },
        }),
      };
    },
  };
  vi.doMock("@/lib/db/connection", () => ({
    assertDatabaseWriteAllowed: vi.fn(),
    db: {
      transaction: (callback: (executor: typeof transactionExecutor) => Promise<boolean>) =>
        callback(transactionExecutor),
    },
  }));
  const { writeGitHubActivityRefreshToDb } = await import("@/lib/db/mutations/github-activity");
  const publishActivity = (
    activity: GitHubActivityApiResponse,
    intent: GitHubActivityWriteIntent,
  ) =>
    writeGitHubActivityRefreshToDb(
      activity,
      createGitHubActivitySummary({
        allTimeData: activity.cumulativeAllTimeData,
        totalRepositoriesContributedTo: 0,
        linesOfCodeByCategory: createEmptyCategoryStats(),
      }),
      [],
      intent,
    );
  return {
    getStoredRefresh: () => storedRefresh,
    getTransactionEvents: () => transactionEvents,
    initialRefresh,
    publishActivity,
  };
};

describe("GitHub data access", () => {
  describe("GitHub Activity View", () => {
    const priorYearCommits = {
      totalCommits: 5,
      totalLinesAdded: 240,
      totalLinesRemoved: 40,
      publicCommits: 3,
      privateCommits: 2,
      perRepo: {
        "william/example": {
          commits: 5,
          linesAdded: 240,
          linesRemoved: 40,
          isPrivate: false,
        },
      },
    } satisfies PriorYearCommitSummary;

    it("ignores prior-year commits attached only to the trailing-year segment", async () => {
      const activity = await readGithubActivityView({
        trailingYearData: buildGitHubSegment({ allPriorYearCommits: priorYearCommits }),
        cumulativeAllTimeData: buildGitHubSegment({ totalContributions: 50 }),
      });

      expect(activity.priorYearCommits).toBeUndefined();
    });

    it("projects aggregate prior-year commits without repository details", async () => {
      const lastModified = new Date("2026-07-13T19:20:30.000Z");
      const activity = await readGithubActivityView(
        {
          trailingYearData: buildGitHubSegment(),
          cumulativeAllTimeData: buildGitHubSegment({ allPriorYearCommits: priorYearCommits }),
        },
        lastModified,
      );

      expect(activity.priorYearCommits).toEqual(
        publicPriorYearCommitSummarySchema.parse(priorYearCommits),
      );
      expect(activity.priorYearCommits).not.toHaveProperty("perRepo");
      expect(activity.lastRefreshed).toBe(lastModified.toISOString());
    });

    it("leaves prior-year commits undefined when cumulative data has no summary", async () => {
      const activity = await readGithubActivityView({
        trailingYearData: buildGitHubSegment(),
        cumulativeAllTimeData: buildGitHubSegment(),
      });

      expect(activity.priorYearCommits).toBeUndefined();
    });
  });

  describe("GitHub Repo Processor", () => {
    it("uses cached weekly stats when the live contributor API fails", async () => {
      vi.resetModules();
      const readRepoWeeklyStatsRecord = vi.fn().mockResolvedValue({
        repoOwnerLogin: "owner",
        repoName: "repo",
        lastFetched: "2026-06-09T00:00:00.000Z",
        status: "complete",
        stats: [{ w: Date.parse("2026-06-01T00:00:00.000Z") / 1000, a: 100, d: 40, c: 3 }],
      });
      const writeRepoWeeklyStatsRecord = vi.fn();
      vi.doMock("@/lib/data-access/github-api", () => ({
        fetchContributorStats: vi.fn().mockRejectedValue(new Error("GitHub unavailable")),
        GitHubContributorStatsPendingError: class GitHubContributorStatsPendingError extends Error {},
        GitHubContributorStatsRateLimitError: class GitHubContributorStatsRateLimitError extends Error {},
      }));
      vi.doMock("@/lib/data-access/github-storage", () => ({
        readRepoWeeklyStatsRecord,
        writeRepoWeeklyStatsRecord,
      }));

      const { processSingleRepository } = await import("@/lib/data-access/github-repo-processor");
      const repo: GraphQLRepoNode = {
        id: "repo-id",
        name: "repo",
        owner: { login: "owner" },
        nameWithOwner: "owner/repo",
        isFork: false,
        isPrivate: false,
      };
      const result = await processSingleRepository({
        repo,
        githubRepoOwner: "owner",
        trailingYearFromDate: new Date("2025-06-10T00:00:00.000Z"),
        now: new Date("2026-06-10T00:00:00.000Z"),
      });

      expect(result.yearLinesAdded).toBe(100);
      expect(result.yearLinesRemoved).toBe(40);
      expect(result.allTimeLinesAdded).toBe(100);
      expect(result.dataComplete).toBe(false);
      expect(result.hasAllTimeData).toBe(true);
      expect(writeRepoWeeklyStatsRecord).not.toHaveBeenCalled();
    });
  });

  describe("GitHub Activity Persistence", () => {
    const healthyActivity = buildGitHubActivity({
      data: [{ date: "2026-06-09", count: 3, level: 1 }],
      totalContributions: 100,
    });

    it("preserves healthy activity when an incomplete refresh arrives", async () => {
      const { getStoredRefresh, getTransactionEvents, initialRefresh, publishActivity } =
        await loadGitHubActivityWriter(healthyActivity);

      await expect(
        publishActivity(
          buildGitHubActivity({
            data: [{ date: "2026-06-10", count: 5, level: 2 }],
            totalContributions: 150,
            dataComplete: false,
          }),
          GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
        ),
      ).resolves.toBe(false);

      expect(getStoredRefresh()).toEqual(initialRefresh);
      expect(getTransactionEvents()).toEqual([GITHUB_ACTIVITY_LOCK_EVENT, "read"]);
    });

    it("replaces healthy activity for a complete empty current repository set", async () => {
      const emptyActivity = buildGitHubActivity({
        data: [],
        totalContributions: 0,
        linesAdded: 0,
        linesRemoved: 0,
        dataComplete: true,
      });
      const { getStoredRefresh, getTransactionEvents, publishActivity } =
        await loadGitHubActivityWriter(healthyActivity);

      await publishActivity(
        emptyActivity,
        GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
      );

      const storedRefresh = getStoredRefresh();
      expect(storedRefresh.activity).toEqual(emptyActivity);
      expect(storedRefresh.summary.totalContributions).toBe(0);
      expect(storedRefresh.aggregatedActivity).toEqual([]);
      expect(getTransactionEvents()).toEqual([GITHUB_ACTIVITY_LOCK_EVENT, "read", "write"]);
    });

    it("keeps every previous record when the atomic insert fails", async () => {
      const { getStoredRefresh, getTransactionEvents, initialRefresh, publishActivity } =
        await loadGitHubActivityWriter(healthyActivity, true);

      await expect(
        publishActivity(healthyActivity, GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY),
      ).rejects.toThrow("atomic insert failed");
      expect(getStoredRefresh()).toEqual(initialRefresh);
      expect(getTransactionEvents()).toEqual([GITHUB_ACTIVITY_LOCK_EVENT, "read", "write"]);
    });

    it.each([
      ["nonzero", { totalContributions: 1 }],
      ["incomplete", { dataComplete: false }],
      ["added", { linesAdded: 1 }],
      ["removed", { linesRemoved: 1 }],
    ])("rejects %s empty-repository replacements", async (_name, overrides) => {
      const { getStoredRefresh, getTransactionEvents, initialRefresh, publishActivity } =
        await loadGitHubActivityWriter(healthyActivity);

      await expect(
        publishActivity(
          buildGitHubActivity({
            data: [],
            totalContributions: 0,
            linesAdded: 0,
            linesRemoved: 0,
            dataComplete: true,
            ...overrides,
          }),
          GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
        ),
      ).rejects.toThrow("complete, zero-contribution activity data");
      expect(getStoredRefresh()).toEqual(initialRefresh);
      expect(getTransactionEvents()).toEqual([GITHUB_ACTIVITY_LOCK_EVENT, "read"]);
    });
  });
});
