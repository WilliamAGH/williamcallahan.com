const {
  mockFetchContributedRepositories,
  mockIsGitHubApiConfigured,
  mockIsOperationAllowed,
  mockProcessSingleRepository,
  mockReadRepoWeeklyStatsRecord,
  mockWriteGitHubActivityRefreshRecord,
} = vi.hoisted(() => ({
  mockFetchContributedRepositories: vi.fn(),
  mockIsGitHubApiConfigured: vi.fn(),
  mockIsOperationAllowed: vi.fn(),
  mockProcessSingleRepository: vi.fn(),
  mockReadRepoWeeklyStatsRecord: vi.fn(),
  mockWriteGitHubActivityRefreshRecord: vi.fn(),
}));

vi.mock("@/lib/data-access/github-api", () => ({
  fetchContributedRepositories: mockFetchContributedRepositories,
  getGitHubUsername: vi.fn(() => "test-owner"),
  isGitHubApiConfigured: mockIsGitHubApiConfigured,
}));
vi.mock("@/lib/data-access/github-storage", () => ({
  readRepoWeeklyStatsRecord: mockReadRepoWeeklyStatsRecord,
  writeGitHubActivityRefreshRecord: mockWriteGitHubActivityRefreshRecord,
}));
vi.mock("@/lib/data-access/github-repo-processor", () => ({
  processSingleRepository: mockProcessSingleRepository,
}));
vi.mock("@/lib/rate-limiter", () => ({
  isOperationAllowed: mockIsOperationAllowed,
}));

import { refreshGitHubActivityDataFromApi } from "../../src/lib/data-access/github";
import { createGitHubActivitySummary } from "@/lib/data-access/github-activity-summaries";
import type { writeGitHubActivityRefreshRecord } from "@/lib/data-access/github-storage";
import {
  calculateAggregatedWeeklyActivity,
  createEmptyCategoryStats,
} from "@/lib/data-access/github-processing";
import { processRepositoryStats } from "@/lib/data-access/github-repo-stats";
import { GraphQLRepoNodeSchema } from "@/types/github";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivitySegment,
  type GitHubActivitySummary,
  type GitHubActivityWriteIntent,
} from "@/types/schemas/github-storage";
import type {
  SingleRepoProcessingInput,
  SingleRepoProcessingResult,
} from "@/types/features/github-processing";

type RefreshGitHubActivityResult = NonNullable<
  Awaited<ReturnType<typeof refreshGitHubActivityDataFromApi>>
>;

let persistedRefresh: Parameters<typeof writeGitHubActivityRefreshRecord> | undefined;

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
    persistedRefresh = undefined;

    mockIsGitHubApiConfigured.mockReturnValue(true);
    mockIsOperationAllowed.mockReturnValue(true);
    mockProcessSingleRepository.mockReset();
    mockReadRepoWeeklyStatsRecord.mockReset();
    mockWriteGitHubActivityRefreshRecord.mockImplementation(
      async (
        activity: GitHubActivityApiResponse,
        summary: GitHubActivitySummary,
        aggregatedActivity: AggregatedWeeklyActivity[],
        intent: GitHubActivityWriteIntent = GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
      ): Promise<boolean> => {
        persistedRefresh = [activity, summary, aggregatedActivity, intent];
        return true;
      },
    );
  });

  it("replaces stale aggregate data with a complete zero-repository result", async () => {
    const expectedResult: RefreshGitHubActivityResult = {
      trailingYearData: zeroSegment,
      allTimeData: zeroSegment,
    };
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });

    await expect(refreshGitHubActivityDataFromApi()).resolves.toEqual(expectedResult);
    if (persistedRefresh === undefined) {
      throw new Error("The zero-repository refresh was not persisted.");
    }
    const [persistedActivity, persistedSummary, persistedAggregate, persistedIntent] =
      persistedRefresh;
    expect(mockWriteGitHubActivityRefreshRecord).toHaveBeenCalledOnce();
    expect(persistedActivity).toEqual({
      trailingYearData: zeroSegment,
      cumulativeAllTimeData: zeroSegment,
    });
    expect(persistedIntent).toBe(
      GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
    );
    expect(persistedAggregate).toEqual([]);
    expect(persistedSummary.totalContributions).toBe(0);
    expect(persistedSummary.totalLinesAdded).toBe(0);
    expect(persistedSummary.totalLinesRemoved).toBe(0);
    expect(persistedSummary.totalRepositoriesContributedTo).toBe(0);
    expect(persistedSummary.linesOfCodeByCategory).toEqual(createEmptyCategoryStats());
  });

  it("does not persist any refresh record when activity preservation refuses the refresh", async () => {
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });
    mockWriteGitHubActivityRefreshRecord.mockResolvedValue(false);

    await expect(refreshGitHubActivityDataFromApi()).rejects.toThrow(
      "preserved its existing activity record",
    );
    expect(mockWriteGitHubActivityRefreshRecord).toHaveBeenCalledTimes(1);
    expect(persistedRefresh).toBeUndefined();
  });

  it("propagates the original GraphQL failure without persisting stale data", async () => {
    const graphQlFailure = new Error("GitHub GraphQL rate limit exceeded");
    mockFetchContributedRepositories.mockRejectedValue(graphQlFailure);

    await expect(refreshGitHubActivityDataFromApi()).rejects.toBe(graphQlFailure);
    expect(persistedRefresh).toBeUndefined();
  });

  it("returns null without persisting when GitHub API configuration is absent", async () => {
    mockIsGitHubApiConfigured.mockReturnValue(false);

    await expect(refreshGitHubActivityDataFromApi()).resolves.toBeNull();
    expect(persistedRefresh).toBeUndefined();
  });

  it("does not persist a partial refresh in dry-run mode", async () => {
    process.env.DRY_RUN = "true";
    mockFetchContributedRepositories.mockResolvedValue({ userId: "user-id", repositories: [] });

    await expect(refreshGitHubActivityDataFromApi()).rejects.toThrow(
      "skipped aggregate calculation in dry-run mode",
    );
    expect(mockWriteGitHubActivityRefreshRecord).not.toHaveBeenCalled();
    expect(persistedRefresh).toBeUndefined();
  });

  it("aggregates only the current repository identifiers", async () => {
    mockReadRepoWeeklyStatsRecord.mockResolvedValue({
      repoOwnerLogin: "current-owner",
      repoName: "current-repo",
      lastFetched: "2026-07-13T00:00:00.000Z",
      status: "complete",
      stats: [{ w: Date.parse("2026-07-06T00:00:00.000Z") / 1000, a: 12, d: 3, c: 1 }],
    });
    const result = await calculateAggregatedWeeklyActivity(["current-owner/current-repo"]);

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

describe("GitHub activity atomic persistence", () => {
  const healthyActivity: GitHubActivityApiResponse = {
    trailingYearData: {
      ...zeroSegment,
      data: [{ date: "2026-07-13", count: 1, level: 1 }],
      totalContributions: 1,
    },
    cumulativeAllTimeData: { ...zeroSegment, totalContributions: 1 },
  };
  const summaryFor = (activity: GitHubActivityApiResponse) =>
    createGitHubActivitySummary({
      allTimeData: activity.cumulativeAllTimeData,
      totalRepositoriesContributedTo: 1,
      linesOfCodeByCategory: createEmptyCategoryStats(),
    });
  const loadWriter = async (existing: unknown, rejectInsert = false) => {
    vi.resetModules();
    const events: string[] = [];
    let records: Array<{ dataType: string; updatedAt: number }> = [];
    const captureMessage = vi.fn(() => {
      events.push("integrity");
      return "integrity-event";
    });
    const tx = {
      execute: () => (events.push("lock"), Promise.resolve()),
      select: () => (
        events.push("read"),
        { from: () => ({ where: () => ({ limit: async () => [{ payload: existing }] }) }) }
      ),
      insert: () => {
        events.push("write");
        return {
          values: (next: typeof records) => ({
            onConflictDoUpdate: async () => {
              if (rejectInsert) throw new Error("atomic insert failed");
              records = next;
            },
          }),
        };
      },
    };
    vi.doMock("@sentry/nextjs", () => ({ captureMessage }));
    vi.doMock("@/lib/db/connection", () => ({
      assertDatabaseWriteAllowed: vi.fn(),
      db: {
        select: tx.select,
        transaction: (callback: (executor: typeof tx) => Promise<boolean>) => callback(tx),
      },
    }));
    const { writeGitHubActivityRefreshToDb } = await import("@/lib/db/mutations/github-activity");
    const { readGitHubActivityFromDb } = await import("@/lib/db/queries/github-activity");
    const publish = (
      activity = healthyActivity,
      intent: GitHubActivityWriteIntent = GITHUB_ACTIVITY_WRITE_INTENTS.PRESERVE_HEALTHY_ACTIVITY,
    ) => writeGitHubActivityRefreshToDb(activity, summaryFor(activity), [], intent);
    return { captureMessage, events, getRecords: () => records, publish, readGitHubActivityFromDb };
  };
  it("locks, reads, and writes every projection with one timestamp", async () => {
    const { events, getRecords, publish } = await loadWriter(healthyActivity);
    await expect(publish()).resolves.toBe(true);
    expect(events).toEqual(["lock", "read", "write"]);
    const records = getRecords();
    const dataTypes = records.map(({ dataType }) => dataType).toSorted();
    expect(dataTypes).toEqual(["activity", "aggregated-weekly", "summary"]);
    expect(new Set(records.map(({ updatedAt }) => updatedAt))).toHaveLength(1);
  });
  it("refuses degrading and invalid empty-set publications before insertion", async () => {
    const incomplete = {
      ...healthyActivity,
      trailingYearData: { ...healthyActivity.trailingYearData, dataComplete: false },
    };
    const refused = await loadWriter(healthyActivity);
    await expect(refused.publish(incomplete)).resolves.toBe(false);
    expect(refused.events).toEqual(["lock", "read"]);
    const invalid = await loadWriter(healthyActivity);
    await expect(
      invalid.publish(
        healthyActivity,
        GITHUB_ACTIVITY_WRITE_INTENTS.REPLACE_EMPTY_CURRENT_REPOSITORY_SET,
      ),
    ).rejects.toThrow("complete, zero-contribution activity data");
    expect(invalid.events).toEqual(["lock", "read"]);
  });
  it("keeps ordinary reads strict while a locked refresh repairs malformed activity", async () => {
    const writer = await loadWriter({ legacy: "must-not-be-logged" });
    await expect(writer.readGitHubActivityFromDb()).rejects.toMatchObject({ name: "ZodError" });
    expect(writer.events).toEqual(["read"]);
    writer.events.length = 0;
    await expect(writer.publish()).resolves.toBe(true);
    expect(writer.events).toEqual(["lock", "read", "integrity", "write"]);
    expect(writer.getRecords()).toHaveLength(3);
    expect(writer.captureMessage).toHaveBeenCalledExactlyOnceWith(
      "Stored GitHub activity payload failed schema validation",
      expect.objectContaining({ level: "error" }),
    );
    expect(JSON.stringify(writer.captureMessage.mock.calls)).not.toContain("must-not-be-logged");
  });
  it("leaves projections untouched when the atomic insert fails", async () => {
    const writer = await loadWriter(healthyActivity, true);
    await expect(writer.publish()).rejects.toThrow("atomic insert failed");
    expect(writer.getRecords()).toEqual([]);
  });
});
