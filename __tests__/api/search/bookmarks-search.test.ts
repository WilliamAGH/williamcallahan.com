import { GET } from "@/app/api/search/bookmarks/route";
import { searchBookmarks } from "@/lib/search";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import type { SearchResult } from "@/types/search";
import type { UnifiedBookmark } from "@/types";

jest.mock("@/lib/search");
jest.mock("@/lib/bookmarks/service.server");

const mockSearchBookmarks = jest.mocked(searchBookmarks);
const mockGetBookmarks = jest.mocked(getBookmarks);

describe("Bookmarks Search API", () => {
  const idMatch1 = "bk-1";
  const idMatch2 = "bk-2";

  const searchResults: SearchResult[] = [
    {
      id: idMatch1,
      type: "bookmark",
      title: "SDK for Claude Code",
      description: "CLI tool",
      url: "/bookmarks/sdk",
      score: 1,
    },
    {
      id: idMatch2,
      type: "bookmark",
      title: "Another SDK article",
      description: "Docs",
      url: "/bookmarks/sdk2",
      score: 0.9,
    },
  ];

  const dataset: UnifiedBookmark[] = [
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
    {
      id: "unmatched",
      url: "https://example.com/other",
      title: "Unrelated",
      description: "No match",
      tags: [],
      dateBookmarked: "2025-01-03",
    } as UnifiedBookmark,
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchBookmarks.mockResolvedValue(searchResults);
    mockGetBookmarks.mockResolvedValue(dataset);
  });

  it("returns matched bookmarks for query", async () => {
    const request = {
      url: "http://localhost:3000/api/search/bookmarks?q=sdk",
    } as any;

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(2);
    const ids = body.data.map((b: UnifiedBookmark) => b.id);
    expect(ids).toContain(idMatch1);
    expect(ids).toContain(idMatch2);
  });
});

afterAll(() => {
  jest.unmock("@/lib/bookmarks/service.server");
  jest.unmock("@/lib/search");
  jest.resetModules();
});
