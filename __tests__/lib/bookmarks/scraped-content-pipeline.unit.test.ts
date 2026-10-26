import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKMARKS_API_CONFIG } from "@/lib/constants";
import {
  type BookmarksApiContext,
  EmptyBookmarksApiResponseError,
  fetchAllPagesFromApi,
} from "@/lib/bookmarks/refresh-helpers";
import { normalizeBookmark, normalizeBookmarks } from "@/lib/bookmarks/normalize";
import { normalizeBookmarkTag } from "@/lib/bookmarks/utils";
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
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it("normalizes special-character tag slugs through the canonical builder", () => {
    const rawBookmark = makeRawBookmark("bookmark-special-tag", null);
    rawBookmark.tags = [{ id: "tag-ai-ml", name: "AI & ML", attachedBy: "user" }];

    expect(normalizeBookmark(rawBookmark, 0)?.tags).toEqual([
      { id: "tag-ai-ml", name: "AI & ML", slug: "ai-and-ml", attachedBy: "user" },
    ]);
  });

  it("keeps a saved link without publishing a publisher challenge as article content", () => {
    const raw = makeRawBookmark(
      "blocked-source",
      "<title>Just a moment...</title><p>Enable JavaScript and cookies to continue</p>",
    );
    raw.content.title = "Just a moment...";
    raw.content.description = null;
    raw.content.screenshotAssetId = "challenge-screenshot";
    raw.summary = "This is a bot verification page; the actual article was not retrieved.";
    raw.note = "Read this research paper later.";

    const result = normalizeBookmark(raw, 0);

    expect(result?.title).toBe("Saved link from example.com");
    expect(result?.description).toContain("publisher returned an access challenge");
    expect(result?.summary).toBeNull();
    expect(result?.scrapedContentText).toBeUndefined();
    expect(result?.content?.crawlStatus).toBe("blocked");
    expect(result?.content?.screenshotAssetId).toBeUndefined();
    expect(result?.note).toBe("Read this research paper later.");
    expect(result?.url).toBe(raw.content.url);
  });

  it("preserves the user's title when the publisher returns a challenge", () => {
    const raw = makeRawBookmark("blocked-custom-title", null);
    raw.title = "A paper I want to read";
    raw.content.title = "Just a moment...";
    raw.summary = "The page shows a Cloudflare bot-verification screen.";

    const result = normalizeBookmark(raw, 0);

    expect(result?.title).toBe("A paper I want to read");
    expect(result?.content?.crawlStatus).toBe("blocked");
    expect(result?.summary).toBeNull();
  });

  it("does not reject an article discussing Cloudflare and browser verification", () => {
    const raw = makeRawBookmark(
      "article-about-challenges",
      "<p>Cloudflare browser verification is an access challenge. This article explains it.</p>",
    );
    raw.content.title = "Understanding browser verification";

    const result = normalizeBookmark(raw, 0);

    expect(result?.title).toBe("Understanding browser verification");
    expect(result?.content?.crawlStatus).toBe("success");
    expect(result?.scrapedContentText).toContain("This article explains it.");
  });

  it("canonicalizes string tags and replaces stale persisted tag slugs", () => {
    expect(normalizeBookmarkTag("AI & ML")).toEqual({
      id: "AI & ML",
      name: "AI & ML",
      slug: "ai-and-ml",
      color: undefined,
    });
    expect(
      normalizeBookmarkTag({
        id: "tag-ai-ml",
        name: "AI & ML",
        slug: "ai-&-ml",
        color: "blue",
      }),
    ).toEqual({ id: "tag-ai-ml", name: "AI & ML", slug: "ai-and-ml", color: "blue" });
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

  it.each([undefined, "25000"])("uses the bookmark API deadline %s", async (value) => {
    vi.stubEnv("BOOKMARKS_API_REQUEST_TIMEOUT_MS", value);
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ bookmarks: [makeRawBookmark("deadline", null)], nextCursor: null }),
    );
    await fetchAllPagesFromApi(createBookmarksApiContext());
    expect(timeout).toHaveBeenCalledWith(value === undefined ? 10_000 : 25_000);
  });

  it.each(["0", "-1", "1.5", "Infinity", "invalid", ""])(
    "rejects invalid bookmark API deadline %s",
    (value) => {
      vi.stubEnv("BOOKMARKS_API_REQUEST_TIMEOUT_MS", value);
      expect(() => BOOKMARKS_API_CONFIG.REQUEST_TIMEOUT_MS).toThrow(
        "BOOKMARKS_API_REQUEST_TIMEOUT_MS",
      );
    },
  );

  it("retains terminal page timeout context and cause without URL credentials or query", async () => {
    vi.useFakeTimers();
    vi.stubEnv("BOOKMARKS_API_REQUEST_TIMEOUT_MS", "10000");
    const failure = new DOMException("The operation timed out", "TimeoutError");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(failure);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const context = createBookmarksApiContext();
    context.apiUrl = "https://user:password@example.com/api/v1/bookmarks?token=private";
    const outcome = fetchAllPagesFromApi(context).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw new Error("Expected terminal page error");
    // The shared retry boundary normalizes cross-realm DOMExceptions to Error.
    expect(error.cause).toMatchObject({ message: failure.message });
    expect(error.message).toContain("upstream=https://example.com/api/v1/bookmarks");
    expect(error.message).toContain("page=1 phase=fetch deadlineMs=10000 attempt=2");
    expect(error.message).toContain("The operation timed out");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(warning.mock.calls[0]?.[0]).toContain("attempt=1");
    for (const output of [error.message, ...info.mock.calls.flat(), ...warning.mock.calls.flat()]) {
      if (typeof output === "string") expect(output).not.toMatch(/password|token=private|Bearer/);
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
