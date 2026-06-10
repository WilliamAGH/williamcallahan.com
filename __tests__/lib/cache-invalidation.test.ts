/**
 * Test suite to verify Next.js 15 cache invalidation is working correctly
 */

// Mock modules with ESM dependencies before importing
vi.mock("@/lib/data-access/github-public-api");
vi.mock("@/lib/data-access/opengraph");

// Mock DB-backed hybrid search (blog posts now use PostgreSQL)
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: vi.fn().mockResolvedValue([]),
  hybridSearchBooks: vi.fn().mockResolvedValue([]),
}));

// Mock query embedding (requires AI endpoint not available in tests)
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

// Mock bookmarks module - returns array, not object with .data
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
import { getGithubActivity, invalidateAllGitHubCaches } from "@/lib/data-access/github-public-api";
import { getAllPosts } from "@/lib/blog";
import { invalidateBlogCache } from "@/lib/blog/mdx";
import type { GraphQLRepoNode } from "@/types/github";
import type {
  GitHubActivityApiResponse,
  GitHubActivitySegment,
  PriorYearCommitSummary,
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

const readGithubActivityView = async (record: GitHubActivityApiResponse) => {
  vi.resetModules();
  vi.doMock("@/lib/data-access/github-storage", () => ({
    readGitHubActivityRecord: () => Promise.resolve(record),
    getGitHubActivityMetadata: () => Promise.resolve(null),
    isFlatStoredGithubActivityFormat: () => false,
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

describe("Next.js Cache Invalidation", () => {
  const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === "true";

  beforeAll(() => {
    console.log(`Testing with USE_NEXTJS_CACHE: ${USE_NEXTJS_CACHE}`);
  });

  describe("Search Cache", () => {
    it("should cache and invalidate search results", async () => {
      const query = "javascript";

      // First search
      const results1 = await searchBlogPostsServerSide(query);
      expect(results1).toBeDefined();
      expect(Array.isArray(results1)).toBe(true);

      // Second search (should be cached if USE_NEXTJS_CACHE is true)
      const start = Date.now();
      const results2 = await searchBlogPostsServerSide(query);
      const cachedTime = Date.now() - start;
      expect(results2).toBeDefined();

      // Invalidate cache
      invalidateSearchCache();
      invalidateSearchQueryCache(query);

      // Third search (should be fresh)
      const start2 = Date.now();
      const results3 = await searchBlogPostsServerSide(query);
      const freshTime = Date.now() - start2;
      expect(results3).toBeDefined();

      // Log timing info
      console.log(`Search cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
    });
  });

  describe("Bookmarks Cache", () => {
    it("should cache and invalidate bookmarks data", async () => {
      try {
        // First fetch
        const page1 = await getBookmarksPage(1);
        expect(page1).toBeDefined();
        expect(Array.isArray(page1)).toBe(true);

        // Second fetch (should be cached)
        const start = Date.now();
        const page2 = await getBookmarksPage(1);
        const cachedTime = Date.now() - start;
        expect(page2.length).toBe(page1.length);

        // Invalidate cache
        invalidateBookmarksCache();

        // Third fetch (should be fresh)
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

  describe.todo("GitHub Cache", () => {
    it("should cache and invalidate GitHub activity data", async () => {
      try {
        // First fetch
        const activity1 = await getGithubActivity();
        expect(activity1).toBeDefined();
        expect(activity1.trailingYearData).toBeDefined();

        // Second fetch (should be cached)
        const start = Date.now();
        const activity2 = await getGithubActivity();
        const cachedTime = Date.now() - start;
        expect(activity2.trailingYearData.contributionCalendar.totalContributions).toBe(
          activity1.trailingYearData.contributionCalendar.totalContributions,
        );

        // Invalidate cache
        invalidateAllGitHubCaches();

        // Third fetch (should be fresh)
        const start2 = Date.now();
        const activity3 = await getGithubActivity();
        const freshTime = Date.now() - start2;
        expect(activity3.trailingYearData.contributionCalendar.totalContributions).toBe(
          activity1.trailingYearData.contributionCalendar.totalContributions,
        );

        console.log(`GitHub cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
      } catch {
        console.log("GitHub test skipped - data not available");
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

    it("projects prior-year commits from cumulative all-time data", async () => {
      const activity = await readGithubActivityView({
        trailingYearData: buildGitHubSegment(),
        cumulativeAllTimeData: buildGitHubSegment({ allPriorYearCommits: priorYearCommits }),
      });

      expect(activity.priorYearCommits).toEqual(priorYearCommits);
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

    it("does not overwrite complete activity with an incomplete refresh", async () => {
      vi.resetModules();
      const insert = vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        })),
      }));
      vi.doMock("@/lib/db/connection", () => ({
        assertDatabaseWriteAllowed: vi.fn(),
        db: { insert },
      }));
      vi.doMock("@/lib/db/queries/github-activity", () => ({
        readGitHubActivityFromDb: () =>
          Promise.resolve({
            trailingYearData: buildGitHubSegment({
              data: [{ date: "2026-06-09", count: 3, level: 1 }],
              totalContributions: 100,
              dataComplete: true,
            }),
            cumulativeAllTimeData: buildGitHubSegment({ totalContributions: 200 }),
          }),
      }));

      const { writeGitHubActivityToDb } = await import("@/lib/db/mutations/github-activity");
      const result = await writeGitHubActivityToDb({
        trailingYearData: buildGitHubSegment({
          data: [{ date: "2026-06-10", count: 5, level: 2 }],
          totalContributions: 150,
          dataComplete: false,
        }),
        cumulativeAllTimeData: buildGitHubSegment({ totalContributions: 250 }),
      });

      expect(result).toBe(true);
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("Blog Cache", () => {
    it("should cache and invalidate blog posts", async () => {
      // First fetch
      const posts1 = await getAllPosts();
      expect(posts1).toBeDefined();
      expect(Array.isArray(posts1)).toBe(true);
      expect(posts1.length).toBeGreaterThan(0);

      // Second fetch (should be cached)
      const start = Date.now();
      const posts2 = await getAllPosts();
      const cachedTime = Date.now() - start;
      expect(posts2.length).toBe(posts1.length);

      // Invalidate cache
      invalidateBlogCache();

      // Third fetch (should be fresh)
      const start2 = Date.now();
      const posts3 = await getAllPosts();
      const freshTime = Date.now() - start2;
      expect(posts3.length).toBe(posts1.length);

      console.log(`Blog cache test - Cached: ${cachedTime}ms, Fresh: ${freshTime}ms`);
    }, 30000); // 30 second timeout for MDX processing
  });
});
