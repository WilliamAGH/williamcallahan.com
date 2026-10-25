import type { assertDatabaseWriteAllowed } from "@/lib/db/connection";
import type { githubActivityStore } from "@/lib/db/schema/github-activity";
import { createGitHubActivitySummary } from "@/lib/data-access/github-activity-summaries";
import { createEmptyCategoryStats } from "@/lib/data-access/github-processing";
import {
  GITHUB_ACTIVITY_WRITE_INTENTS,
  gitHubActivityApiResponseSchema,
  gitHubActivitySummarySchema,
  type AggregatedWeeklyActivity,
  type GitHubActivityApiResponse,
  type GitHubActivityWriteIntent,
} from "@/types/schemas/github-storage";

const healthyActivity: GitHubActivityApiResponse = {
  trailingYearData: {
    source: "api",
    data: [{ date: "2026-07-13", count: 1, level: 1 }],
    totalContributions: 1,
    linesAdded: 120,
    linesRemoved: 30,
    dataComplete: true,
  },
  cumulativeAllTimeData: {
    source: "api",
    data: [],
    totalContributions: 2,
    linesAdded: 240,
    linesRemoved: 60,
    dataComplete: true,
  },
};
const summaryFor = (activity: GitHubActivityApiResponse) =>
  createGitHubActivitySummary({
    allTimeData: activity.cumulativeAllTimeData,
    totalRepositoriesContributedTo: 1,
    linesOfCodeByCategory: createEmptyCategoryStats(),
  });

async function loadWriter(
  existing: unknown,
  rejectInsert = false,
  previousLoc?: {
    summary: ReturnType<typeof summaryFor>;
    aggregate: AggregatedWeeklyActivity[];
  },
) {
  vi.resetModules();
  const events: string[] = [];
  let records: Array<typeof githubActivityStore.$inferInsert> = [];
  const previousPayloads: unknown[] = [existing, previousLoc?.summary, previousLoc?.aggregate];
  const captureMessage = vi.fn<typeof import("@sentry/nextjs").captureMessage>(() => {
    events.push("integrity");
    return "integrity-event";
  });
  const tx = {
    execute: () => {
      events.push("lock");
      return Promise.resolve();
    },
    select: () => {
      events.push("read");
      const payload = previousLoc ? previousPayloads.shift() : existing;
      return { from: () => ({ where: () => ({ limit: async () => [{ payload }] }) }) };
    },
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
    assertDatabaseWriteAllowed: vi.fn<typeof assertDatabaseWriteAllowed>(),
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
    signal?: AbortSignal,
  ) => writeGitHubActivityRefreshToDb(activity, summaryFor(activity), [], intent, signal);
  return { captureMessage, events, getRecords: () => records, publish, readGitHubActivityFromDb };
}

describe("GitHub activity atomic persistence", () => {
  it("does not start publication when the collection deadline has expired", async () => {
    const writer = await loadWriter(healthyActivity);
    const controller = new AbortController();
    const deadline = new Error("collection deadline");
    controller.abort(deadline);
    await expect(writer.publish(healthyActivity, undefined, controller.signal)).rejects.toBe(
      deadline,
    );
    expect(writer.events).toEqual([]);
    expect(writer.getRecords()).toEqual([]);
  });

  it("locks, reads, and writes every projection with one timestamp", async () => {
    const { events, getRecords, publish } = await loadWriter(healthyActivity);
    await expect(publish()).resolves.toBe(true);
    expect(events).toEqual(["lock", "read", "write"]);
    const records = getRecords();
    expect(records.map(({ dataType }) => dataType).toSorted()).toEqual([
      "activity",
      "aggregated-weekly",
      "summary",
    ]);
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

  it("publishes verified calendars while preserving the coherent LOC snapshot when stats are pending", async () => {
    const summary = summaryFor(healthyActivity);
    summary.linesOfCodeByCategory.frontend.linesAdded = 240;
    summary.linesOfCodeByCategory.frontend.linesRemoved = 60;
    summary.linesOfCodeByCategory.frontend.netChange = 180;
    summary.linesOfCodeByCategory.frontend.repoCount = 1;
    const aggregate = [{ weekStartDate: "2026-07-06", linesAdded: 240, linesRemoved: 60 }];
    const writer = await loadWriter(healthyActivity, false, { summary, aggregate });
    const refreshed: GitHubActivityApiResponse = {
      trailingYearData: {
        ...healthyActivity.trailingYearData,
        linesAdded: 0,
        linesRemoved: 0,
        dataComplete: false,
        contributionCountSource: "github-calendar",
      },
      cumulativeAllTimeData: {
        ...healthyActivity.cumulativeAllTimeData,
        linesAdded: 0,
        linesRemoved: 0,
        totalContributions: 75,
        contributionCountSource: "github-calendar",
        dataComplete: false,
      },
    };
    await expect(writer.publish(refreshed)).resolves.toBe(true);
    const records = writer.getRecords();
    const activity = gitHubActivityApiResponseSchema.parse(
      records.find((r) => r.dataType === "activity")?.payload,
    );
    const storedSummary = gitHubActivitySummarySchema.parse(
      records.find((r) => r.dataType === "summary")?.payload,
    );
    expect(activity.trailingYearData).toMatchObject({
      totalContributions: 1,
      linesAdded: 120,
      linesRemoved: 30,
      dataComplete: false,
    });
    expect(activity.cumulativeAllTimeData).toMatchObject({
      totalContributions: 75,
      linesAdded: 240,
      linesRemoved: 60,
      dataComplete: false,
    });
    expect(storedSummary).toMatchObject({
      totalContributions: 75,
      totalLinesAdded: 240,
      totalLinesRemoved: 60,
      linesOfCodeByCategory: summary.linesOfCodeByCategory,
      dataComplete: false,
    });
    expect(records.find((r) => r.dataType === "aggregated-weekly")?.payload).toEqual(aggregate);
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
