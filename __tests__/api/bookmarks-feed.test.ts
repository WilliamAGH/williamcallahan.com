import { GET } from "@/app/api/bookmarks/route";
import { getBookmarksIndex, getBookmarksPage } from "@/lib/bookmarks/service.server";
import { getDiscoveryRankedBookmarks } from "@/lib/db/queries/discovery-scores";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import type { BookmarkSlugMapping, UnifiedBookmark } from "@/types";

vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/slug-manager");
vi.mock("@/lib/db/queries/discovery-scores");
vi.mock("@/lib/db/queries/discovery-grouped");
vi.mock("@/lib/db/queries/embedding-similarity");

const mockGetBookmarksPage = vi.mocked(getBookmarksPage);
const mockGetBookmarksIndex = vi.mocked(getBookmarksIndex);
const mockGetDiscoveryRankedBookmarks = vi.mocked(getDiscoveryRankedBookmarks);
const mockLoadSlugMapping = vi.mocked(loadSlugMapping);

function createBookmark(id: string, dateBookmarked: string): UnifiedBookmark {
  return {
    id,
    slug: `slug-${id}`,
    url: `https://example.com/${id}`,
    title: `Bookmark ${id}`,
    description: `Description ${id}`,
    tags: [],
    dateBookmarked,
  } as UnifiedBookmark;
}

function createSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: BookmarkSlugMapping["slugs"] = Object.fromEntries(
    bookmarks.map((bookmark) => [
      bookmark.id,
      {
        id: bookmark.id,
        slug: bookmark.slug,
        url: bookmark.url,
        title: bookmark.title,
      },
    ]),
  );
  const reverseMap: BookmarkSlugMapping["reverseMap"] = Object.fromEntries(
    Object.entries(slugs).map(([id, entry]) => [entry.slug, id]),
  );

  return {
    version: "1.0.0",
    generated: "2026-02-27T00:00:00.000Z",
    count: bookmarks.length,
    checksum: "test-checksum",
    slugs,
    reverseMap,
  };
}

describe("Bookmark feed modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarksIndex.mockResolvedValue({
      count: 4,
      totalPages: 1,
      pageSize: 24,
      lastModified: "2026-02-27T00:00:00.000Z",
      lastFetchedAt: 1_772_451_200_000,
      lastAttemptedAt: 1_772_451_200_000,
      checksum: "test",
      changeDetected: false,
    });
  });

  it("returns chronological data when feed=latest", async () => {
    const latestBookmarks = [
      createBookmark("newest", "2026-02-27T10:00:00.000Z"),
      createBookmark("older", "2026-02-20T10:00:00.000Z"),
    ];
    mockGetBookmarksPage.mockResolvedValue(latestBookmarks);
    mockLoadSlugMapping.mockResolvedValue(createSlugMapping(latestBookmarks));

    const response = await GET(
      new Request("http://localhost/api/bookmarks?feed=latest&page=1&limit=20"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.feed).toBe("latest");
    expect(payload.data.map((bookmark: UnifiedBookmark) => bookmark.id)).toEqual([
      "newest",
      "older",
    ]);
    expect(mockGetDiscoveryRankedBookmarks).not.toHaveBeenCalled();
  });

  it("returns scored data when feed=discover in ranking order", async () => {
    const ranked = [
      { bookmark: createBookmark("a1", "2026-02-27T10:00:00.000Z") },
      { bookmark: createBookmark("a2", "2026-02-26T10:00:00.000Z") },
      { bookmark: createBookmark("a3", "2026-02-25T10:00:00.000Z") },
      { bookmark: createBookmark("b1", "2026-02-24T10:00:00.000Z") },
    ].map((row, index) => ({
      ...row,
      discoveryScore: 100 - index,
      hasEngagement: true,
    }));

    mockGetDiscoveryRankedBookmarks.mockResolvedValue(ranked);
    mockLoadSlugMapping.mockResolvedValue(
      createSlugMapping(ranked.map((entry) => entry.bookmark as UnifiedBookmark)),
    );

    const response = await GET(
      new Request("http://localhost/api/bookmarks?feed=discover&page=1&limit=4"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meta.feed).toBe("discover");
    expect(payload.data.map((bookmark: UnifiedBookmark) => bookmark.id)).toEqual([
      "a1",
      "a2",
      "a3",
      "b1",
    ]);
    expect(mockGetDiscoveryRankedBookmarks).toHaveBeenCalledWith(1, 4, { recencyDays: 0 });
  });

  it("returns 500 error when discover ranking fails (no silent fallbacks)", async () => {
    mockGetDiscoveryRankedBookmarks.mockRejectedValueOnce(new Error("relation missing"));

    const response = await GET(
      new Request("http://localhost/api/bookmarks?feed=discover&page=1&limit=20"),
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error).toBe("Failed to fetch bookmarks");
  });
});
