import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAllPagesFromApi } from "@/lib/bookmarks/refresh-helpers";
import { normalizeBookmark } from "@/lib/bookmarks/normalize";
import type { RawApiBookmark } from "@/types/bookmark";

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

    const result = await fetchAllPagesFromApi({
      apiUrl: "https://example.com/api/v1/lists/test-list/bookmarks",
      requestHeaders: {
        Accept: "application/json",
        Authorization: "Bearer token",
      },
    });

    expect(result).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(
      "https://example.com/api/v1/lists/test-list/bookmarks?includeContent=true",
    );
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "https://example.com/api/v1/lists/test-list/bookmarks?cursor=next-cursor&includeContent=true",
    );
  });
});
