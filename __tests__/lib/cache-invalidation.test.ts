vi.mock("@/lib/data-access/github-public-api");
vi.mock("@/lib/data-access/opengraph");

vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: vi.fn().mockResolvedValue([]),
  hybridSearchBooks: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  getBookmarksPage: vi.fn().mockResolvedValue([]),
  invalidateBookmarksCache: vi.fn(),
}));

import { invalidateSearchCache, invalidateSearchQueryCache } from "@/lib/search/cache-invalidation";
import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import {
  getBookmarksPage,
  invalidateBookmarksCache,
} from "@/lib/bookmarks/bookmarks-data-access.server";
import { getAllPosts } from "@/lib/blog";
import { invalidateBlogCache } from "@/lib/blog/mdx";
import { createGitHubActivitySummary } from "@/lib/data-access/github-activity-summaries";
import { createEmptyCategoryStats } from "@/lib/data-access/github-processing";
import type { GraphQLRepoNode } from "@/types/github";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  gitHubActivityApiResponseSchema,
  publicPriorYearCommitSummarySchema,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivityWriteIntent,
  type PriorYearCommitSummary,
} from "@/types/schemas/github-storage";

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
  let storedActivity = initialActivity;
  const transactionExecutor = {
    execute: vi.fn(),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ payload: storedActivity }] }),
      }),
    }),
    insert: () => ({
      values: (records: Array<{ dataType: string; payload: unknown }>) => ({
        onConflictDoUpdate: async () => {
          if (rejectInsert) throw new Error("atomic insert failed");
          const activityRecord = records.find((record) => record.dataType === "activity");
          if (activityRecord === undefined) throw new Error("Atomic refresh omitted activity.");
          storedActivity = gitHubActivityApiResponseSchema.parse(activityRecord.payload);
        },
      }),
    }),
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
  return { getStoredActivity: () => storedActivity, publishActivity };
};

describe("Next.js Cache Invalidation", () => {
  describe("Search Cache", () => {
    it("should cache and invalidate search results", async () => {
      const query = "javascript";

      const results1 = await searchBlogPostsServerSide(query);
      expect(results1).toBeDefined();
      expect(Array.isArray(results1)).toBe(true);
      const results2 = await searchBlogPostsServerSide(query);
      expect(results2).toBeDefined();

      invalidateSearchCache();
      invalidateSearchQueryCache(query);

      const results3 = await searchBlogPostsServerSide(query);
      expect(results3).toBeDefined();
    });
  });

  describe("Bookmarks Cache", () => {
    it("should cache and invalidate bookmarks data", async () => {
      const page1 = await getBookmarksPage(1);
      expect(Array.isArray(page1)).toBe(true);
      await expect(getBookmarksPage(1)).resolves.toHaveLength(page1.length);

      invalidateBookmarksCache();

      await expect(getBookmarksPage(1)).resolves.toHaveLength(page1.length);
    });
  });

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
      const { getStoredActivity, publishActivity } =
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

      expect(getStoredActivity()).toEqual(healthyActivity);
    });

    it("replaces healthy activity for a complete empty current repository set", async () => {
      const emptyActivity = buildGitHubActivity({
        data: [],
        totalContributions: 0,
        linesAdded: 0,
        linesRemoved: 0,
        dataComplete: true,
      });
      const { getStoredActivity, publishActivity } =
        await loadGitHubActivityWriter(healthyActivity);

      await publishActivity(
        emptyActivity,
        GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
      );

      expect(getStoredActivity()).toEqual(emptyActivity);
    });

    it("keeps the previous activity when the atomic insert fails", async () => {
      const { getStoredActivity, publishActivity } = await loadGitHubActivityWriter(
        healthyActivity,
        true,
      );

      await expect(
        publishActivity(healthyActivity, GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY),
      ).rejects.toThrow("atomic insert failed");
      expect(getStoredActivity()).toEqual(healthyActivity);
    });

    it.each([
      ["nonzero", { totalContributions: 1 }],
      ["incomplete", { dataComplete: false }],
      ["added", { linesAdded: 1 }],
      ["removed", { linesRemoved: 1 }],
    ])("rejects %s empty-repository replacements", async (_name, overrides) => {
      const { getStoredActivity, publishActivity } =
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
      expect(getStoredActivity()).toEqual(healthyActivity);
    });
  });

  describe("Blog Cache", () => {
    it("should cache and invalidate blog posts", async () => {
      const posts1 = await getAllPosts();
      expect(posts1).toBeDefined();
      expect(Array.isArray(posts1)).toBe(true);
      expect(posts1.length).toBeGreaterThan(0);
      const posts2 = await getAllPosts();
      expect(posts2.length).toBe(posts1.length);

      invalidateBlogCache();

      const posts3 = await getAllPosts();
      expect(posts3.length).toBe(posts1.length);
    }, 30000); // 30 second timeout for MDX processing
  });
});
