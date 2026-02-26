import { GET } from "@/app/api/search/bookmarks/route";
import type { SearchResult } from "@/types/search";
import type { UnifiedBookmark } from "@/types";

const { mockSearchBookmarksFtsPage } = vi.hoisted(() => ({
  mockSearchBookmarksFtsPage: vi.fn(),
}));

vi.mock("@/lib/db/queries/bookmarks", () => ({
  searchBookmarksFtsPage: mockSearchBookmarksFtsPage,
}));

describe("Bookmarks Search API", () => {
  const idMatch1 = "bk-1";
  const idMatch2 = "bk-2";

  const matchedBookmarks: UnifiedBookmark[] = [
    {
      id: idMatch1,
      url: "https://example.com/sdk1",
      title: "SDK for Claude Code (CLI)",
      description: "CLI tool",
      tags: [],
      dateBookmarked: "2025-01-01",
    } as UnifiedBookmark,
    {
      id: idMatch2,
      url: "https://example.com/sdk2",
      title: "Another SDK article",
      description: "Docs",
      tags: [],
      dateBookmarked: "2025-01-02",
    } as UnifiedBookmark,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchBookmarksFtsPage.mockResolvedValue({
      totalCount: matchedBookmarks.length,
      items: [
        { bookmark: matchedBookmarks[0], score: 1 },
        { bookmark: matchedBookmarks[1], score: 0.9 },
      ],
    });
  });

  it("returns matched bookmarks for query", async () => {
    const request = {
      url: "http://localhost:3000/api/search/bookmarks?q=sdk&page=1&limit=24",
      headers: new Headers([["x-forwarded-for", "127.0.0.1"]]),
    } as any;

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("meta");
    expect(body).toHaveProperty("totalCount");
    expect(body).toHaveProperty("hasMore");
    expect(Array.isArray(body.data)).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.results).toHaveLength(2);
    expect(body.totalCount).toBe(2);
    expect(body.hasMore).toBe(false);
    expect(body.meta.scope).toBe("bookmarks");
    expect(body.meta.query).toBe("sdk");
    const ids = body.data.map((b: UnifiedBookmark) => b.id);
    expect(ids).toEqual([idMatch1, idMatch2]);
    const resultIds = body.results.map((b: SearchResult) => b.id);
    expect(resultIds).toEqual([idMatch1, idMatch2]);
  });
});

afterAll(() => {
  vi.doUnmock("@/lib/db/queries/bookmarks");
  vi.resetModules();
});
