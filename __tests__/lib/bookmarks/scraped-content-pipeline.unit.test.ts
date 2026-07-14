import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type BookmarksApiContext,
  EmptyBookmarksApiResponseError,
  fetchAllPagesFromApi,
} from "@/lib/bookmarks/refresh-helpers";
import { normalizeBookmark, normalizeBookmarks } from "@/lib/bookmarks/normalize";
import type { RawApiBookmark } from "@/types/schemas/bookmark";

function makeRawBookmark(id: string, htmlContent: string | null): RawApiBookmark {
  return {
    id,
    createdAt: "2026-02-26T01:00:00.000Z",
    modifiedAt: "2026-02-26T01:00:00.000Z",
    title: null,
    archived: false,
    favourited: false,
    taggingStatus: "success",
    summarizationStatus: "success",
    note: null,
    summary: null,
    tags: [],
    content: {
      type: "link",
      url: "https://example.com/article",
      title: "Example title",
      description: "Example description",
      htmlContent,
      imageUrl: null,
      imageAssetId: null,
      screenshotAssetId: null,
      favicon: null,
      crawledAt: "2026-02-26T01:00:00.000Z",
      crawlStatus: "success",
      author: null,
      publisher: null,
      datePublished: null,
      dateModified: null,
    },
    assets: [],
  };
}

function createJsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  } as Response;
}

function createBookmarksApiContext(): BookmarksApiContext {
  return {
    apiUrl: "https://example.com/api/v1/lists/test-list/bookmarks",
    requestHeaders: {
      Accept: "application/json",
      Authorization: "Bearer token",
    },
  };
}

describe("Scraped content pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes HTML to clean text and strips raw HTML before persistence", () => {
    const normalized = normalizeBookmark(
      makeRawBookmark(
        "bookmark-1",
        "<div><p>Hello <strong>world</strong>.</p><p>Second paragraph.</p></div>",
      ),
      0,
    );

    expect(normalized).not.toBeNull();
    expect(normalized?.scrapedContentText).toContain("Hello");
    expect(normalized?.scrapedContentText).toContain("world");
    expect(normalized?.scrapedContentText).toContain("Second paragraph");
    // Raw HTML is not carried to the persisted content object
    expect(normalized?.content).not.toHaveProperty("htmlContent");
  });

  it("drops raw bookmarks with an empty source URL before persistence", () => {
    const rawBookmark = makeRawBookmark("bookmark-empty-url", null);
    rawBookmark.content.url = "";

    expect(normalizeBookmark(rawBookmark, 0)).toBeNull();
  });

  it("aborts collection normalization when any bookmark has an invalid source URL", () => {
    const invalidBookmark = makeRawBookmark("bookmark-empty-url", null);
    invalidBookmark.content.url = "";

    expect(() =>
      normalizeBookmarks([makeRawBookmark("bookmark-valid", null), invalidBookmark]),
    ).toThrow("Refusing partial refresh");
  });

  it("requests includeContent=true on every paginated API fetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        createJsonResponse({
          bookmarks: [makeRawBookmark("bookmark-1", "<p>alpha</p>")],
          nextCursor: "next-cursor",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          bookmarks: [makeRawBookmark("bookmark-2", "<p>beta</p>")],
          nextCursor: null,
        }),
      );

    const result = await fetchAllPagesFromApi(createBookmarksApiContext());

    expect(result).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://example.com/api/v1/lists/test-list/bookmarks?includeContent=true",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "https://example.com/api/v1/lists/test-list/bookmarks?cursor=next-cursor&includeContent=true",
    );
  });

  it("rejects an empty API response instead of returning an empty refresh dataset", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse({ bookmarks: [], nextCursor: null }),
    );

    await expect(fetchAllPagesFromApi(createBookmarksApiContext())).rejects.toBeInstanceOf(
      EmptyBookmarksApiResponseError,
    );
  });

  it.each([
    ["timeout", new DOMException("The operation timed out", "TimeoutError")],
    ["network", new TypeError("fetch failed")],
  ])("retries a transient %s fetch failure once", async (_kind, failure) => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(
        createJsonResponse({
          bookmarks: [makeRawBookmark("bookmark-retried", "<p>recovered</p>")],
          nextCursor: null,
        }),
      );

    try {
      const resultPromise = fetchAllPagesFromApi(createBookmarksApiContext());
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toEqual([
        makeRawBookmark("bookmark-retried", "<p>recovered</p>"),
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      fetchSpy.mockRestore();
    }
  });

  it("does not retry an HTTP response failure", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
      text: async () => "service unavailable",
    } as Response);

    try {
      await expect(fetchAllPagesFromApi(createBookmarksApiContext())).rejects.toThrow(
        "failed with status 503",
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("does not retry an invalid API response", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createJsonResponse({ bookmarks: "not-an-array", nextCursor: null }));

    try {
      await expect(fetchAllPagesFromApi(createBookmarksApiContext())).rejects.toThrow(
        "Invalid bookmarks API response shape",
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
