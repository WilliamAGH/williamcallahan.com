vi.mock("@/lib/data-access/github-public-api");

import type { GraphQLRepoNode } from "@/types/github";
import {
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

function buildRepo(owner = "owner", name = "repo"): GraphQLRepoNode {
  return {
    id: `${owner}/${name}`,
    name,
    owner: { login: owner },
    nameWithOwner: `${owner}/${name}`,
    isFork: false,
    isPrivate: false,
  };
}

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

      try {
        const { processSingleRepository } = await import("@/lib/data-access/github-repo-processor");
        const result = await processSingleRepository({
          repo: buildRepo(),
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
      } finally {
        vi.doUnmock("@/lib/data-access/github-api");
        vi.doUnmock("@/lib/data-access/github-storage");
      }
    });

    it.each([
      [
        "omits the configured owner",
        [
          {
            author: { login: "another-user" },
            weeks: [{ w: Date.parse("2026-06-01T00:00:00.000Z") / 1000, a: 100, d: 40, c: 3 }],
          },
        ],
      ],
      ["has no weeks for the configured owner", [{ author: { login: "owner" }, weeks: [] }]],
    ])(
      "replaces stale weekly stats when a successful response %s",
      async (_scenario, contributors) => {
        vi.resetModules();
        const readRepoWeeklyStatsRecord = vi.fn().mockResolvedValue({
          repoOwnerLogin: "owner",
          repoName: "repo",
          lastFetched: "2026-06-09T00:00:00.000Z",
          status: "complete",
          stats: [{ w: Date.parse("2026-06-01T00:00:00.000Z") / 1000, a: 100, d: 40, c: 3 }],
        });
        const writeRepoWeeklyStatsRecord = vi.fn().mockResolvedValue(true);
        const fetchContributorStats = vi.fn().mockResolvedValue(contributors);
        vi.doMock("@/lib/data-access/github-api", () => ({
          fetchContributorStats,
          GitHubContributorStatsPendingError: class GitHubContributorStatsPendingError extends Error {},
          GitHubContributorStatsRateLimitError: class GitHubContributorStatsRateLimitError extends Error {},
        }));
        vi.doMock("@/lib/data-access/github-storage", () => ({
          readRepoWeeklyStatsRecord,
          writeRepoWeeklyStatsRecord,
        }));

        try {
          const { processSingleRepository } =
            await import("@/lib/data-access/github-repo-processor");
          const result = await processSingleRepository({
            repo: buildRepo(),
            githubRepoOwner: "owner",
            trailingYearFromDate: new Date("2025-06-10T00:00:00.000Z"),
            now: new Date("2026-06-10T00:00:00.000Z"),
          });

          expect(result).toEqual({
            yearLinesAdded: 0,
            yearLinesRemoved: 0,
            allTimeLinesAdded: 0,
            allTimeLinesRemoved: 0,
            olderThanYearCommits: 0,
            olderThanYearLinesAdded: 0,
            olderThanYearLinesRemoved: 0,
            dataComplete: true,
            hasAllTimeData: false,
            status: "empty_no_user_contribs",
          });
          expect(readRepoWeeklyStatsRecord).not.toHaveBeenCalled();
          expect(writeRepoWeeklyStatsRecord).toHaveBeenCalledExactlyOnceWith("owner", "repo", {
            repoOwnerLogin: "owner",
            repoName: "repo",
            lastFetched: "2026-06-10T00:00:00.000Z",
            status: "empty_no_user_contribs",
            stats: [],
          });
        } finally {
          vi.doUnmock("@/lib/data-access/github-api");
          vi.doUnmock("@/lib/data-access/github-storage");
        }
      },
    );

    it("treats a no-content contributor response as authoritative empty data", async () => {
      vi.resetModules();
      const githubHttpClient = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      vi.doMock("@/lib/utils/http-client", () => ({
        createRetryingFetch: vi.fn(() => githubHttpClient),
      }));
      vi.doMock("@/lib/rate-limiter", () => ({ waitForPermit: vi.fn() }));

      try {
        const { fetchContributorStats } = await import("@/lib/data-access/github-api");
        await expect(fetchContributorStats("owner", "repo")).resolves.toEqual([]);
        expect(githubHttpClient).toHaveBeenCalledExactlyOnceWith(
          "https://api.github.com/repos/owner/repo/stats/contributors",
          expect.objectContaining({ headers: expect.any(Object) }),
        );
      } finally {
        vi.doUnmock("@/lib/rate-limiter");
        vi.doUnmock("@/lib/utils/http-client");
      }
    });
  });
});
