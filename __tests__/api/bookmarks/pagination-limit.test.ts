import { GET } from "@/app/api/bookmarks/route";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { readJsonS3Optional } from "@/lib/s3/json";
// Import BOOKMARKS_PER_PAGE lazily within isolated module to avoid global cache interfering with env-config tests
// Placeholder variable – will be set in beforeAll
let BOOKMARKS_PER_PAGE: number;
import type { UnifiedBookmark } from "@/types";
import type { BookmarkSlugMapping } from "@/types/bookmark";

// Mock dependencies used inside the route
vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/s3/json");
vi.mock("@/lib/bookmarks/slug-manager");
import * as slugManagerModule from "@/lib/bookmarks/slug-manager";

const mockGetBookmarks = vi.mocked(getBookmarks);
const mockReadJsonS3 = vi.mocked(readJsonS3Optional);
const slugManager = vi.mocked(slugManagerModule);
const loadSlugMapping = vi.mocked(slugManager.loadSlugMapping);

describe("Bookmark API – large limit behavior", () => {
  let mockBookmarks: UnifiedBookmark[];

  beforeAll(async () => {
    vi.resetModules();
    const constants = await import("@/lib/constants");
    BOOKMARKS_PER_PAGE = constants.BOOKMARKS_PER_PAGE;
    mockBookmarks = Array.from({ length: BOOKMARKS_PER_PAGE + 6 }).map((_, i) => ({
      id: `bm-${i}`,
      url: `https://example${i}.com`,
      title: `Bookmark ${i}`,
      description: `Description ${i}`,
      tags: [],
      dateBookmarked: "2025-01-01",
    })) as unknown as UnifiedBookmark[];
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarks.mockResolvedValue(mockBookmarks);
    mockReadJsonS3.mockResolvedValue({
      count: mockBookmarks.length,
      totalPages: Math.ceil(mockBookmarks.length / BOOKMARKS_PER_PAGE),
      lastFetchedAt: Date.now(),
    });

    // Mock slug mapping for bookmarks with correct typing and reverse map
    const slugs: BookmarkSlugMapping["slugs"] = Object.fromEntries(
      mockBookmarks.map((bookmark) => [
        bookmark.id,
        {
          id: bookmark.id,
          slug: `mock-slug-${bookmark.id}`,
          url: bookmark.url,
          title: bookmark.title ?? bookmark.url,
        },
      ]),
    );
    const reverseMap: BookmarkSlugMapping["reverseMap"] = Object.fromEntries(
      Object.entries(slugs).map(([id, entry]) => [entry.slug, id]),
    );
    const mockSlugMapping: BookmarkSlugMapping = {
      slugs,
      reverseMap,
      version: "1.0.0",
      generated: "2025-01-01T00:00:00.000Z",
      count: mockBookmarks.length,
      checksum: "mock-checksum",
    };
    loadSlugMapping.mockResolvedValue(mockSlugMapping);
  });

  it("returns the full dataset when limit exceeds BOOKMARKS_PER_PAGE", async () => {
    const request = {
      url: "http://localhost:3000/api/bookmarks?limit=1000&page=1",
      nextUrl: {
        searchParams: new URLSearchParams({ limit: "1000", page: "1" }),
      },
    } as unknown as import("next/server").NextRequest;

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(mockBookmarks.length);
    expect(data.meta.pagination.limit).toBe(100);
    expect(data.meta.pagination.total).toBe(mockBookmarks.length);
  });

  afterAll(() => {
    vi.doUnmock("@/lib/bookmarks/service.server");
    vi.doUnmock("@/lib/s3/json");
    vi.resetModules();
  });
});
