const {
  mockFetchContributedRepositories,
  mockIsGitHubApiConfigured,
  mockIsOperationAllowed,
  mockReadRepoWeeklyStatsRecord,
  mockWriteAggregatedWeeklyActivityRecord,
  mockWriteGitHubActivitySummary,
  mockWriteGitHubActivityRecord,
} = vi.hoisted(() => ({
  mockFetchContributedRepositories: vi.fn(),
  mockIsGitHubApiConfigured: vi.fn(),
  mockIsOperationAllowed: vi.fn(),
  mockReadRepoWeeklyStatsRecord: vi.fn(),
  mockWriteAggregatedWeeklyActivityRecord: vi.fn(),
  mockWriteGitHubActivitySummary: vi.fn(),
  mockWriteGitHubActivityRecord: vi.fn(),
}));

vi.mock("@/lib/data-access/github-api", () => ({
  fetchContributedRepositories: mockFetchContributedRepositories,
  getGitHubUsername: vi.fn(() => "test-owner"),
  isGitHubApiConfigured: mockIsGitHubApiConfigured,
}));
vi.mock("@/lib/data-access/github-storage", () => ({
  readRepoWeeklyStatsRecord: mockReadRepoWeeklyStatsRecord,
  writeAggregatedWeeklyActivityRecord: mockWriteAggregatedWeeklyActivityRecord,
  writeGitHubActivityRecord: mockWriteGitHubActivityRecord,
}));
vi.mock("@/lib/data-access/github-activity-summaries", () => ({
  writeGitHubActivitySummary: mockWriteGitHubActivitySummary,
}));
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: mockIsOperationAllowed,
}));

import { refreshGitHubActivityDataFromApi } from "../../src/lib/data-access/github";
import {
  calculateAndStoreAggregatedWeeklyActivity,
  createEmptyCategoryStats,
} from "@/lib/data-access/github-processing";
import {
  contributionDaySchema,
  GITHUB_ACTIVITY_WRITE_INTENTS,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivityWriteIntent,
  userActivityViewSchema,
} from "@/types/schemas/github-storage";
import type { GitHubSummaryInput } from "@/types/github";

type RefreshGitHubActivityResult = NonNullable<
  Awaited<ReturnType<typeof refreshGitHubActivityDataFromApi>>
>;

let persistedActivity: GitHubActivityApiResponse | undefined;
let persistedAggregate: AggregatedWeeklyActivity[] | undefined;
let persistedSummary: GitHubSummaryInput | undefined;
let persistedIntent: GitHubActivityWriteIntent | undefined;

const zeroSegment: GitHubActivitySegment = {
  source: "api",
  data: [],
  totalContributions: 0,
  linesAdded: 0,
  linesRemoved: 0,
  dataComplete: true,
};

describe("GitHub activity refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTO_REPAIR_CSV_FILES = "false";
    process.env.DRY_RUN = "false";
    persistedActivity = undefined;
    persistedAggregate = undefined;
    persistedSummary = undefined;
    persistedIntent = undefined;

    mockIsGitHubApiConfigured.mockReturnValue(true);
    mockIsOperationAllowed.mockReturnValue(true);
    mockReadRepoWeeklyStatsRecord.mockReset();
    mockWriteGitHubActivityRecord.mockImplementation(
      async (
        data: GitHubActivityApiResponse,
        intent: GitHubActivityWriteIntent = GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
      ): Promise<boolean> => {
        persistedActivity = data;
        persistedIntent = intent;
        return true;
      },
    );
    mockWriteAggregatedWeeklyActivityRecord.mockImplementation(
      async (data: AggregatedWeeklyActivity[]): Promise<boolean> => {
        if (data.length === 0) {
          persistedAggregate = data;
          return true;
        }

        throw new Error("The zero-repository refresh must persist an empty aggregate.");
      },
    );
    mockWriteGitHubActivitySummary.mockImplementation(
      async (input: GitHubSummaryInput): Promise<boolean> => {
        persistedSummary = input;
        return true;
      },
    );
  });

  it("replaces stale aggregate data with a complete zero-repository result", async () => {
    const expectedResult: RefreshGitHubActivityResult = {
      trailingYearData: zeroSegment,
      allTimeData: zeroSegment,
    };
    persistedAggregate = [{ weekStartDate: "2026-01-01", linesAdded: 123, linesRemoved: 45 }];
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });

    await expect(refreshGitHubActivityDataFromApi()).resolves.toEqual(expectedResult);
    expect(persistedActivity).toEqual({
      trailingYearData: zeroSegment,
      cumulativeAllTimeData: zeroSegment,
    });
    expect(persistedIntent).toBe(
      GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
    );
    expect(persistedAggregate).toEqual([]);
    expect(persistedSummary).toBeDefined();
    if (persistedSummary === undefined) {
      throw new Error("The zero-repository refresh did not persist its summary.");
    }
    expect(persistedSummary.allTimeData).toEqual(zeroSegment);
    expect(persistedSummary.totalRepositoriesContributedTo).toBe(0);
    expect(persistedSummary.allTimeCategoryStats).toEqual(createEmptyCategoryStats());
  });

  it("does not write a partial zero-repository result when summary persistence fails", async () => {
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });
    mockWriteGitHubActivitySummary.mockResolvedValue(false);

    await expect(refreshGitHubActivityDataFromApi()).rejects.toThrow(
      "failed to persist its summary record",
    );
    expect(persistedActivity).toBeUndefined();
    expect(persistedAggregate).toBeUndefined();
  });

  it("propagates the original GraphQL failure without persisting stale data", async () => {
    const graphQlFailure = new Error("GitHub GraphQL rate limit exceeded");
    mockFetchContributedRepositories.mockRejectedValue(graphQlFailure);

    await expect(refreshGitHubActivityDataFromApi()).rejects.toBe(graphQlFailure);
    expect(persistedActivity).toBeUndefined();
    expect(persistedAggregate).toBeUndefined();
    expect(persistedSummary).toBeUndefined();
  });

  it("returns null without persisting when GitHub API configuration is absent", async () => {
    mockIsGitHubApiConfigured.mockReturnValue(false);

    await expect(refreshGitHubActivityDataFromApi()).resolves.toBeNull();
    expect(persistedActivity).toBeUndefined();
    expect(persistedAggregate).toBeUndefined();
    expect(persistedSummary).toBeUndefined();
  });

  it("aggregates only the current repository identifiers", async () => {
    mockReadRepoWeeklyStatsRecord.mockResolvedValue({
      repoOwnerLogin: "current-owner",
      repoName: "current-repo",
      lastFetched: "2026-07-13T00:00:00.000Z",
      status: "complete",
      stats: [{ w: Date.parse("2026-07-06T00:00:00.000Z") / 1000, a: 12, d: 3, c: 1 }],
    });
    mockWriteAggregatedWeeklyActivityRecord.mockResolvedValue(true);

    const result = await calculateAndStoreAggregatedWeeklyActivity(["current-owner/current-repo"]);

    expect(mockReadRepoWeeklyStatsRecord).toHaveBeenCalledExactlyOnceWith(
      "current-owner",
      "current-repo",
    );
    expect(result?.aggregatedActivity).toEqual([
      { weekStartDate: "2026-07-06", linesAdded: 12, linesRemoved: 3 },
    ]);
  });
});

describe("GitHub activity summary persistence", () => {
  it("writes exactly one all-time summary payload", async () => {
    vi.resetModules();
    const writeGitHubSummaryRecord = vi.fn().mockResolvedValue(true);
    vi.doMock("@/lib/data-access/github-storage", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/data-access/github-storage")>()),
      writeGitHubSummaryRecord,
    }));
    vi.doUnmock("@/lib/data-access/github-activity-summaries");

    const { writeGitHubActivitySummary } =
      await import("@/lib/data-access/github-activity-summaries");
    const allTimeCategoryStats = createEmptyCategoryStats();

    await expect(
      writeGitHubActivitySummary({
        allTimeData: { ...zeroSegment, totalContributions: 42 },
        totalRepositoriesContributedTo: 3,
        allTimeCategoryStats,
      }),
    ).resolves.toBe(true);
    expect(writeGitHubSummaryRecord).toHaveBeenCalledOnce();
    expect(writeGitHubSummaryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ totalContributions: 42, totalRepositoriesContributedTo: 3 }),
    );
  });
});

describe("GitHub activity public schemas", () => {
  it("rejects contribution days that the calendar cannot render", () => {
    expect(
      contributionDaySchema.safeParse({ date: "not-a-date", count: 1, level: 1 }).success,
    ).toBe(false);
    expect(
      contributionDaySchema.safeParse({ date: "2026-07-13", count: -1, level: 1 }).success,
    ).toBe(false);
  });

  it("requires an ISO timestamp for the public refresh date", () => {
    expect(
      userActivityViewSchema.safeParse({
        source: "empty",
        trailingYearData: { data: [], totalContributions: 0, dataComplete: false },
        allTimeStats: { totalContributions: 0, linesAdded: 0, linesRemoved: 0 },
        lastRefreshed: "not-a-date",
      }).success,
    ).toBe(false);
  });
});
