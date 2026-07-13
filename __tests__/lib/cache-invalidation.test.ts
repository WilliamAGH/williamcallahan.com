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
});
