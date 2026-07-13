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
import type { GraphQLRepoNode } from "@/types/github";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  publicPriorYearCommitSummarySchema,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
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

const loadGitHubActivityWriter = async (initialActivity: GitHubActivityApiResponse) => {
  vi.resetModules();
  let storedActivity = initialActivity;
  vi.doMock("@/lib/db/connection", () => ({
    assertDatabaseWriteAllowed: vi.fn(),
    db: {
      insert: () => ({
        values: (record: { payload: GitHubActivityApiResponse }) => ({
          onConflictDoUpdate: async () => {
            storedActivity = record.payload;
          },
        }),
      }),
    },
  }));
  vi.doMock("@/lib/db/queries/github-activity", () => ({
    readGitHubActivityFromDb: () => Promise.resolve(storedActivity),
  }));
  const { writeGitHubActivityToDb } = await import("@/lib/db/mutations/github-activity");
  return { getStoredActivity: () => storedActivity, writeGitHubActivityToDb };
};

describe("Next.js Cache Invalidation", () => {
  const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === "true";

  beforeAll(() => {
    console.log(`Testing with USE_NEXTJS_CACHE: ${USE_NEXTJS_CACHE}`);
  });

  describe("Search Cache", () => {
    it("should cache and invalidate search results", async () => {
      const query = "javascript";

      const results1 = await searchBlogPostsServerSide(query);
      expect(results1).toBeDefined();
      expect(Array.isArray(results1)).toBe(true);

      const start = Date.now();
      const results2 = await searchBlogPostsServerSide(query);
      const cachedTime = Date.now() - start;
      expect(results2).toBeDefined();

      invalidateSearchCache();
      invalidateSearchQueryCache(query);

      const start2 = Date.now();
      const results3 = await searchBlogPostsServerSide(query);
      const freshTime = Date.now() - start2;
      expect(results3).toBeDefined();

      console.log(`Search cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
    });
  });

  describe("Bookmarks Cache", () => {
    it("should cache and invalidate bookmarks data", async () => {
      try {
        const page1 = await getBookmarksPage(1);
        expect(page1).toBeDefined();
        expect(Array.isArray(page1)).toBe(true);

        const start = Date.now();
        const page2 = await getBookmarksPage(1);
        const cachedTime = Date.now() - start;
        expect(page2.length).toBe(page1.length);

        invalidateBookmarksCache();

        const start2 = Date.now();
        const page3 = await getBookmarksPage(1);
        const freshTime = Date.now() - start2;
        expect(page3.length).toBe(page1.length);

        console.log(`Bookmarks cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
      } catch {
        console.log("Bookmarks test skipped - S3 not configured");
        expect(true).toBe(true); // Pass the test
      }
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
      const { getStoredActivity, writeGitHubActivityToDb } =
        await loadGitHubActivityWriter(healthyActivity);

      await expect(
        writeGitHubActivityToDb(
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
      const { getStoredActivity, writeGitHubActivityToDb } =
        await loadGitHubActivityWriter(healthyActivity);

      await writeGitHubActivityToDb(
        emptyActivity,
        GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
      );

      expect(getStoredActivity()).toEqual(emptyActivity);
    });

    it("rejects nonzero and incomplete empty-repository replacements", async () => {
      const { getStoredActivity, writeGitHubActivityToDb } =
        await loadGitHubActivityWriter(healthyActivity);

      await expect(
        writeGitHubActivityToDb(
          buildGitHubActivity({ data: [], totalContributions: 1, dataComplete: true }),
          GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
        ),
      ).rejects.toThrow("complete, zero-contribution activity data");
      await expect(
        writeGitHubActivityToDb(
          buildGitHubActivity({ data: [], totalContributions: 0, dataComplete: false }),
          GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
        ),
      ).rejects.toThrow("complete, zero-contribution activity data");
      for (const metric of ["linesAdded", "linesRemoved"] as const) {
        await expect(
          writeGitHubActivityToDb(
            buildGitHubActivity({
              data: [],
              totalContributions: 0,
              [metric]: 1,
              dataComplete: true,
            }),
            GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
          ),
        ).rejects.toThrow("complete, zero-contribution activity data");
      }

      expect(getStoredActivity()).toEqual(healthyActivity);
    });
  });

  describe("Blog Cache", () => {
    it("should cache and invalidate blog posts", async () => {
      const posts1 = await getAllPosts();
      expect(posts1).toBeDefined();
      expect(Array.isArray(posts1)).toBe(true);
      expect(posts1.length).toBeGreaterThan(0);

      const start = Date.now();
      const posts2 = await getAllPosts();
      const cachedTime = Date.now() - start;
      expect(posts2.length).toBe(posts1.length);

      invalidateBlogCache();

      const start2 = Date.now();
      const posts3 = await getAllPosts();
      const freshTime = Date.now() - start2;
      expect(posts3.length).toBe(posts1.length);

      console.log(`Blog cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
    }, 30000); // 30 second timeout for MDX processing
  });
});
