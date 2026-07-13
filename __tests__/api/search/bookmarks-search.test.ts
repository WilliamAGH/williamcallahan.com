import { GET } from "@/app/api/search/bookmarks/route";
import { unifiedBookmarkSchema } from "@/types/schemas/bookmark";
import { bookmarkSearchResponseSchema } from "@/types/schemas/search";
import { NextRequest } from "next/server";

const { mockSearchBookmarksFtsPage } = vi.hoisted(() => ({
  mockSearchBookmarksFtsPage: vi.fn(),
}));

vi.mock("@/lib/db/queries/bookmarks", () => ({
  searchBookmarksFtsPage: mockSearchBookmarksFtsPage,
}));

describe("Bookmarks Search API", () => {
  const idMatch1 = "bk-1";
  const idMatch2 = "bk-2";

  const matchedBookmarks = [
    unifiedBookmarkSchema.parse({
      id: idMatch1,
      url: "https://example.com/sdk1",
      title: "SDK for Claude Code (CLI)",
      description: "CLI tool",
      slug: "sdk-for-claude-code",
      tags: [],
      dateBookmarked: "2025-01-01",
      sourceUpdatedAt: "2025-01-01",
      scrapedContentText: "Full scraped page content must never cross the search API boundary.",
    }),
    unifiedBookmarkSchema.parse({
      id: idMatch2,
      url: "https://example.com/sdk2",
      title: "Another SDK article",
      description: "Docs",
      slug: "another-sdk-article",
      tags: [],
      dateBookmarked: "2025-01-02",
      sourceUpdatedAt: "2025-01-02",
    }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchBookmarksFtsPage.mockResolvedValue({
      totalCount: matchedBookmarks.length,
      items: matchedBookmarks.map((bookmark, index) => ({ bookmark, score: 1 - index * 0.1 })),
    });
  });

  it("returns only compact matched-bookmark projections", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/search/bookmarks?q=sdk&page=1&limit=24",
      { headers: new Headers([["x-forwarded-for", "127.0.0.1"]]) },
    );

    const response = await GET(request);
    const body: unknown = await response.json();
    const parsed = bookmarkSearchResponseSchema.parse(body);

    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("data");
    expect(JSON.stringify(body)).not.toContain("Full scraped page content");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.totalCount).toBe(2);
    expect(parsed.hasMore).toBe(false);
    expect(parsed.meta.scope).toBe("bookmarks");
    expect(parsed.meta.query).toBe("sdk");
    expect(parsed.results).toEqual([
      {
        id: idMatch1,
        type: "bookmark",
        title: "SDK for Claude Code (CLI)",
        description: "CLI tool",
        url: "/bookmarks/sdk-for-claude-code",
        score: 1,
      },
      {
        id: idMatch2,
        type: "bookmark",
        title: "Another SDK article",
        description: "Docs",
        url: "/bookmarks/another-sdk-article",
        score: 0.9,
      },
    ]);
  });
});

afterAll(() => {
  vi.doUnmock("@/lib/db/queries/bookmarks");
  vi.resetModules();
});
