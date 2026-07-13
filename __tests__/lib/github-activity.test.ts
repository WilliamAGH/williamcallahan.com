const {
  mockFetchContributedRepositories,
  mockIsGitHubApiConfigured,
  mockIsOperationAllowed,
  mockProcessSingleRepository,
  mockReadRepoWeeklyStatsRecord,
  mockWriteAggregatedWeeklyActivityRecord,
  mockWriteGitHubActivitySummary,
  mockWriteGitHubActivityRecord,
} = vi.hoisted(() => ({
  mockFetchContributedRepositories: vi.fn(),
  mockIsGitHubApiConfigured: vi.fn(),
  mockIsOperationAllowed: vi.fn(),
  mockProcessSingleRepository: vi.fn(),
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
vi.mock("@/lib/data-access/github-repo-processor", () => ({
  processSingleRepository: mockProcessSingleRepository,
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
import { processRepositoryStats } from "@/lib/data-access/github-repo-stats";
import { GraphQLRepoNodeSchema } from "@/types/github";
import {
  contributionDaySchema,
  GITHUB_ACTIVITY_WRITE_INTENTS,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivitySummary,
  type GitHubActivityWriteIntent,
  userActivityViewSchema,
} from "@/types/schemas/github-storage";
import type {
  SingleRepoProcessingInput,
  SingleRepoProcessingResult,
} from "@/types/features/github-processing";
import type { GitHubSummaryInput } from "@/types/github";

type RefreshGitHubActivityResult = NonNullable<
  Awaited<ReturnType<typeof refreshGitHubActivityDataFromApi>>
>;

let persistedActivity: GitHubActivityApiResponse | undefined;
let persistedAggregate: AggregatedWeeklyActivity[] | undefined;
let persistedSummary: GitHubSummaryInput | undefined;
let persistedIntent: GitHubActivityWriteIntent | undefined;
let writeOrder: string[] = [];

const zeroSegment: GitHubActivitySegment = {
  source: "api",
  data: [],
  totalContributions: 0,
  linesAdded: 0,
  linesRemoved: 0,
  dataComplete: true,
};

function createGraphQLRepositoryFixture(name: string) {
  return GraphQLRepoNodeSchema.parse({
    id: name,
    name,
    owner: { login: "test-owner" },
    nameWithOwner: `test-owner/${name}`,
    isFork: false,
    isPrivate: false,
  });
}

function createRepositoryProcessingResult(
  allTimeLinesAdded: number,
  allTimeLinesRemoved: number,
  hasAllTimeData: boolean,
): SingleRepoProcessingResult {
  return {
    yearLinesAdded: 0,
    yearLinesRemoved: 0,
    allTimeLinesAdded,
    allTimeLinesRemoved,
    olderThanYearCommits: 0,
    olderThanYearLinesAdded: 0,
    olderThanYearLinesRemoved: 0,
    dataComplete: true,
    hasAllTimeData,
  };
}

describe("GitHub activity refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTO_REPAIR_CSV_FILES = "false";
    process.env.DRY_RUN = "false";
    persistedActivity = undefined;
    persistedAggregate = undefined;
    persistedSummary = undefined;
    persistedIntent = undefined;
    writeOrder = [];

    mockIsGitHubApiConfigured.mockReturnValue(true);
    mockIsOperationAllowed.mockReturnValue(true);
    mockProcessSingleRepository.mockReset();
    mockReadRepoWeeklyStatsRecord.mockReset();
    mockWriteGitHubActivityRecord.mockImplementation(
      async (
        data: GitHubActivityApiResponse,
        intent: GitHubActivityWriteIntent = GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
      ): Promise<boolean> => {
        writeOrder.push("activity");
        persistedActivity = data;
        persistedIntent = intent;
        return true;
      },
    );
    mockWriteAggregatedWeeklyActivityRecord.mockImplementation(
      async (data: AggregatedWeeklyActivity[]): Promise<boolean> => {
        writeOrder.push("aggregate");
        if (data.length === 0) {
          persistedAggregate = data;
          return true;
        }

        throw new Error("The zero-repository refresh must persist an empty aggregate.");
      },
    );
    mockWriteGitHubActivitySummary.mockImplementation(
      async (input: GitHubSummaryInput): Promise<boolean> => {
        writeOrder.push("summary");
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
    expect(writeOrder).toEqual(["activity", "summary", "aggregate"]);
    expect(persistedSummary).toBeDefined();
    if (persistedSummary === undefined) {
      throw new Error("The zero-repository refresh did not persist its summary.");
    }
    expect(persistedSummary.allTimeData).toEqual(zeroSegment);
    expect(persistedSummary.totalRepositoriesContributedTo).toBe(0);
    expect(persistedSummary.linesOfCodeByCategory).toEqual(createEmptyCategoryStats());
  });

  it("does not write derived records when activity preservation refuses the refresh", async () => {
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });
    mockWriteGitHubActivityRecord.mockResolvedValue(false);

    await expect(refreshGitHubActivityDataFromApi()).rejects.toThrow(
      "preserved its existing activity record",
    );
    expect(persistedActivity).toBeUndefined();
    expect(persistedAggregate).toBeUndefined();
    expect(persistedSummary).toBeUndefined();
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

  it("counts all-time repositories in their own categories", async () => {
    const repositories = ["frontend-web", "frontend-client", "backend-api", "data-pipeline"].map(
      createGraphQLRepositoryFixture,
    );
    const resultsByRepository = new Map<string, SingleRepoProcessingResult>([
      ["frontend-web", createRepositoryProcessingResult(11, 3, true)],
      ["frontend-client", createRepositoryProcessingResult(6, 2, true)],
      ["backend-api", createRepositoryProcessingResult(4, 1, true)],
      ["data-pipeline", createRepositoryProcessingResult(0, 0, false)],
    ]);
    mockProcessSingleRepository.mockImplementation(
      async ({ repo }: SingleRepoProcessingInput): Promise<SingleRepoProcessingResult> => {
        const result = resultsByRepository.get(repo.name);
        if (result === undefined) {
          throw new Error(`Unexpected repository: ${repo.name}`);
        }
        return result;
      },
    );

    const result = await processRepositoryStats({
      repos: repositories,
      githubRepoOwner: "test-owner",
      trailingYearFromDate: new Date("2025-07-13T00:00:00.000Z"),
      now: new Date("2026-07-13T00:00:00.000Z"),
    });
    const expectedCategoryStats = createEmptyCategoryStats();
    expectedCategoryStats.frontend.linesAdded = 17;
    expectedCategoryStats.frontend.linesRemoved = 5;
    expectedCategoryStats.frontend.netChange = 12;
    expectedCategoryStats.frontend.repoCount = 2;
    expectedCategoryStats.backend.linesAdded = 4;
    expectedCategoryStats.backend.linesRemoved = 1;
    expectedCategoryStats.backend.netChange = 3;
    expectedCategoryStats.backend.repoCount = 1;

    expect(result.allTimeCategoryStats).toEqual(expectedCategoryStats);
  });
});

describe("GitHub activity summary persistence", () => {
  it("preserves distinct all-time repository counts by category", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/data-access/github-activity-summaries");
    let writtenSummary: GitHubActivitySummary | undefined;
    const writeGitHubSummaryRecord = vi.fn(
      async (summary: GitHubActivitySummary): Promise<boolean> => {
        writtenSummary = summary;
        return true;
      },
    );
    vi.doMock("@/lib/data-access/github-storage", () => ({
      writeGitHubSummaryRecord,
    }));

    const { writeGitHubActivitySummary } =
      await import("@/lib/data-access/github-activity-summaries");
    const allTimeCategoryStats = createEmptyCategoryStats();
    allTimeCategoryStats.frontend.repoCount = 2;
    allTimeCategoryStats.backend.repoCount = 1;

    await expect(
      writeGitHubActivitySummary({
        allTimeData: { ...zeroSegment, totalContributions: 42 },
        totalRepositoriesContributedTo: 3,
        linesOfCodeByCategory: allTimeCategoryStats,
      }),
    ).resolves.toBe(true);
    expect(writeGitHubSummaryRecord).toHaveBeenCalledTimes(1);
    if (writtenSummary === undefined) {
      throw new Error("The all-time summary was not persisted.");
    }
    expect(writtenSummary.totalContributions).toBe(42);
    expect(writtenSummary.totalRepositoriesContributedTo).toBe(3);
    expect(writtenSummary.linesOfCodeByCategory).toEqual(allTimeCategoryStats);
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
