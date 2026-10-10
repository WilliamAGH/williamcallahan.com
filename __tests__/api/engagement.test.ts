/**
 * @vitest-environment node
 */

import type { SQL } from "drizzle-orm";
import type { contentEngagement } from "@/lib/db/schema/content-engagement";

const {
  mockWhere,
  mockSelect,
  mockValues,
  mockInsert,
  mockExecute,
  mockTransaction,
  mockResolveDatabaseAccessMode,
} = vi.hoisted(() => {
  const where = vi.fn<(condition: SQL | undefined) => Promise<Array<{ count: number }>>>();
  const from = vi.fn<(table: typeof contentEngagement) => { where: typeof where }>(() => ({
    where,
  }));
  const select = vi.fn<(fields: { count: SQL<number> }) => { from: typeof from }>(() => ({
    from,
  }));
  const values = vi.fn<(rows: Array<typeof contentEngagement.$inferInsert>) => Promise<void>>();
  const insert = vi.fn<(table: typeof contentEngagement) => { values: typeof values }>(() => ({
    values,
  }));
  const execute = vi.fn<(query: SQL) => Promise<void>>();
  const resolveDatabaseAccessMode = vi.fn<
    (typeof import("@/lib/db/connection"))["resolveDatabaseAccessMode"]
  >(() => ({
    allowWrites: true,
    environment: "production",
    source: "test",
  }));
  type EngagementTransaction = {
    select: typeof select;
    insert: typeof insert;
    execute: typeof execute;
  };
  const transaction = vi.fn<
    (callback: (tx: EngagementTransaction) => Promise<boolean>) => Promise<boolean>
  >((callback) => callback({ select, insert, execute }));

  return {
    mockWhere: where,
    mockSelect: select,
    mockValues: values,
    mockInsert: insert,
    mockExecute: execute,
    mockTransaction: transaction,
    mockResolveDatabaseAccessMode: resolveDatabaseAccessMode,
  };
});

vi.mock("@/lib/db/connection", () => ({
  resolveDatabaseAccessMode: mockResolveDatabaseAccessMode,
  db: {
    transaction: mockTransaction,
  },
}));

import { POST } from "@/app/api/engagement/route";
import { createHash } from "node:crypto";

describe("POST /api/engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockResolvedValue([{ count: 0 }]);
    mockValues.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue(undefined);
  });

  it("rejects invalid event payloads", async () => {
    const response = await POST(
      new Request("http://localhost/api/engagement", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.5",
          "user-agent": "vitest",
        },
        body: JSON.stringify({
          events: [{ contentType: "bookmark", contentId: "abc", eventType: "invalid" }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mockResolveDatabaseAccessMode).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns 204 and skips writes when DNT is enabled", async () => {
    const response = await POST(
      new Request("http://localhost/api/engagement", {
        method: "POST",
        headers: {
          dnt: "1",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          events: [{ contentType: "bookmark", contentId: "abc", eventType: "impression" }],
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(mockResolveDatabaseAccessMode).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts valid event batches", async () => {
    const expectedVisitorHash = createHash("sha256").update("10.0.0.1:vitest-agent").digest("hex");
    const response = await POST(
      new Request("http://localhost/api/engagement", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.10, 10.0.0.1",
          "user-agent": "vitest-agent",
        },
        body: JSON.stringify({
          events: [
            { contentType: "bookmark", contentId: "abc", eventType: "impression" },
            { contentType: "bookmark", contentId: "abc", eventType: "dwell", durationMs: 1234 },
          ],
        }),
      }),
    );

    expect(response.status).toBe(204);
    expect(mockResolveDatabaseAccessMode).toHaveBeenCalled();
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: "bookmark",
          contentId: "abc",
          eventType: "impression",
          visitorHash: expectedVisitorHash,
        }),
        expect.objectContaining({
          contentType: "bookmark",
          contentId: "abc",
          eventType: "dwell",
          durationMs: 1234,
          visitorHash: expectedVisitorHash,
        }),
      ]),
    );
  });

  it("returns 503 when database writes are not allowed", async () => {
    mockResolveDatabaseAccessMode.mockReturnValueOnce({
      allowWrites: false,
      environment: "development",
      source: "NEXT_PUBLIC_SITE_URL",
    });

    const response = await POST(
      new Request("http://localhost/api/engagement", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.10",
          "user-agent": "vitest-agent",
        },
        body: JSON.stringify({
          events: [{ contentType: "bookmark", contentId: "abc", eventType: "impression" }],
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
