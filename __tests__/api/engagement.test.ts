/**
 * @vitest-environment node
 */

const { mockWhere, mockSelect, mockValues, mockInsert } = vi.hoisted(() => {
  const where = vi.fn();
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn();
  const insert = vi.fn(() => ({ values }));

  return {
    mockWhere: where,
    mockSelect: select,
    mockValues: values,
    mockInsert: insert,
  };
});

vi.mock("@/lib/db/connection", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

import { POST } from "@/app/api/engagement/route";

describe("POST /api/engagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockResolvedValue([{ count: 0 }]);
    mockValues.mockResolvedValue(undefined);
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
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("accepts valid event batches", async () => {
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
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockValues).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          contentType: "bookmark",
          contentId: "abc",
          eventType: "impression",
          visitorHash: expect.any(String),
        }),
        expect.objectContaining({
          contentType: "bookmark",
          contentId: "abc",
          eventType: "dwell",
          durationMs: 1234,
          visitorHash: expect.any(String),
        }),
      ]),
    );
  });
});
