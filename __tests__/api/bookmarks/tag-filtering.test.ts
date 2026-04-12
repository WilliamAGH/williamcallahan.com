/**
 * Tests for bookmark API tag filtering functionality
 */

import { GET } from "@/app/api/bookmarks/route";
import {
  getBookmarksByTag,
  getBookmarksIndex,
  getBookmarksPage,
  resolveBookmarkTagSlug,
  getBookmarkById,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { findRelatedBookmarkIdsForSeeds } from "@/lib/db/queries/embedding-similarity";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";
import { NextRequest } from "next/server";

// Mock dependencies
vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/slug-manager");
vi.mock("@/lib/db/queries/discovery-scores");
vi.mock("@/lib/db/queries/embedding-similarity");

const mockGetBookmarksByTag = vi.mocked(getBookmarksByTag);
const mockGetBookmarksIndex = vi.mocked(getBookmarksIndex);
const mockGetBookmarksPage = vi.mocked(getBookmarksPage);
const mockGetBookmarkById = vi.mocked(getBookmarkById);
const mockResolveBookmarkTagSlug = vi.mocked(resolveBookmarkTagSlug);
const mockLoadSlugMapping = vi.mocked(loadSlugMapping);
const mockFindRelatedBookmarkIdsForSeeds = vi.mocked(findRelatedBookmarkIdsForSeeds);

/**
 * Helper to generate a mock slug mapping from bookmarks
 */
function createMockSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: Record<string, { id: string; slug: string; url: string; title: string }> = {};
  const reverseMap: Record<string, string> = {};

  for (const bookmark of bookmarks) {
    if (bookmark.slug) {
      slugs[bookmark.id] = {
        id: bookmark.id,
        slug: bookmark.slug,
        url: bookmark.url,
        title: bookmark.title,
      };
      reverseMap[bookmark.slug] = bookmark.id;
    }
  }

  return {
    version: "1.0.0",
    generated: new Date().toISOString(),
    count: bookmarks.length,
    checksum: "test-checksum",
    slugs,
    reverseMap,
  };
}

function createIndexData(count: number, pageSize: number = 24) {
  return {
    count,
    lastFetchedAt: Date.now(),
    totalPages: Math.max(1, Math.ceil(count / pageSize)),
    pageSize,
    lastModified: new Date().toISOString(),
    lastAttemptedAt: Date.now(),
    checksum: "test-checksum",
    changeDetected: false,
  };
}

function createRequest(searchParams: Record<string, string>) {
  const query = new URLSearchParams(searchParams);
  return new NextRequest(`http://localhost:3000/api/bookmarks?${query.toString()}`);
}

describe("Bookmark API Tag Filtering", () => {
  const mockBookmarks: UnifiedBookmark[] = [
    {
      id: "1",
      url: "https://example.com",
      title: "Web Development Guide",
      description: "A comprehensive guide",
      tags: ["Web Development", "JavaScript"],
      dateBookmarked: "2025-01-01",
      slug: "web-development-guide",
    } as UnifiedBookmark,
    {
      id: "2",
      url: "https://example2.com",
      title: "Software Tools",
      description: "Essential tools",
      tags: ["Software Development Tools", "productivity"],
      dateBookmarked: "2025-01-02",
      slug: "software-tools",
    } as UnifiedBookmark,
    {
      id: "3",
      url: "https://example3.com",
      title: "Design Patterns",
      description: "Common patterns",
      tags: ["design", "architecture"],
      dateBookmarked: "2025-01-03",
      slug: "design-patterns",
    } as UnifiedBookmark,
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {}); // Suppress console logs in tests
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Set up default slug mapping mock
    mockLoadSlugMapping.mockResolvedValue(createMockSlugMapping(mockBookmarks));
    mockGetBookmarksIndex.mockResolvedValue(null);
    mockResolveBookmarkTagSlug.mockImplementation(async (rawTag) => {
      const canonicalSlug = tagToSlug(rawTag);
      return {
        requestedSlug: canonicalSlug,
        canonicalSlug,
        canonicalTagName: null,
        isAlias: false,
      };
    });
    mockFindRelatedBookmarkIdsForSeeds.mockResolvedValue([]);
    mockGetBookmarksByTag.mockImplementation(async (slug) => {
      const filtered = mockBookmarks.filter((b) =>
        (b.tags as string[]).some((t) => tagToSlug(t) === slug),
      );
      return {
        bookmarks: filtered,
        totalCount: filtered.length,
        totalPages: 1,
      };
    });
    mockGetBookmarkById.mockImplementation(async (id) => {
      return mockBookmarks.find((b) => b.id === id) ?? null;
    });
    mockGetBookmarksPage.mockImplementation(async () => {
      return mockBookmarks;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tag parameter handling", () => {
    it("should filter bookmarks by tag in slug format", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));

      const response = await GET(createRequest({ tag: "web-development" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
      expect(data.meta.filter).toMatchObject({
        tag: "web-development",
        exactCount: 1,
        relatedCount: 0,
        mode: "exact",
      });
    });

    it("should append semantically related bookmarks after exact tag matches on page 1", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));
      mockFindRelatedBookmarkIdsForSeeds.mockResolvedValueOnce(["2"]);

      const response = await GET(createRequest({ tag: "web-development" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.map((bookmark: UnifiedBookmark) => bookmark.id)).toEqual(["1", "2"]);
      expect(data.meta.filter).toMatchObject({
        tag: "web-development",
        exactCount: 1,
        relatedCount: 1,
        mode: "exact_plus_related",
      });
    });

    it("should handle multi-word tags with hyphens", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));

      const response = await GET(createRequest({ tag: "software-development-tools" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("2");
    });

    it("should handle URL-encoded tags", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));

      const response = await GET(createRequest({ tag: "web development" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
    });

    it("should perform case-insensitive tag matching", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));

      const response = await GET(createRequest({ tag: "WEB-DEVELOPMENT" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
    });

    it("should return empty array for non-existent tags", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(mockBookmarks.length));
      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: [],
        totalCount: 0,
        totalPages: 0,
      });

      const response = await GET(createRequest({ tag: "non-existent-tag" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(0);
      expect(data.meta.pagination.total).toBe(0);
    });

    it("should handle pagination with tag filtering", async () => {
      const largeSet = Array(50)
        .fill(null)
        .map(
          (_, i) =>
            ({
              id: `bookmark-${i}`,
              url: `https://example${i}.com`,
              title: `Bookmark ${i}`,
              description: `Description ${i}`,
              tags: ["test tag"],
              dateBookmarked: "2025-01-01",
              slug: `bookmark-${i}`,
            }) as UnifiedBookmark,
        );

      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: largeSet.slice(20, 40),
        totalCount: 50,
        totalPages: 3,
      });
      mockGetBookmarksIndex.mockResolvedValueOnce(createIndexData(largeSet.length, 20));
      // Override default slug mapping for this test's larger dataset
      mockLoadSlugMapping.mockResolvedValueOnce(createMockSlugMapping(largeSet));

      const response = await GET(createRequest({ tag: "test-tag", page: "2", limit: "20" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(20);
      expect(data.data[0].id).toBe("bookmark-20"); // First item on page 2
      expect(data.meta.pagination).toMatchObject({
        page: 2,
        limit: 20,
        total: 50,
        totalPages: 3,
        hasNext: true,
        hasPrev: true,
      });
    });

    it("should return all bookmarks when no tag filter provided", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(null);
      mockGetBookmarksPage.mockResolvedValueOnce(mockBookmarks);

      const response = await GET(createRequest({ feed: "latest" }));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.meta.filter).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should handle errors gracefully", async () => {
      mockGetBookmarksIndex.mockResolvedValueOnce(null);
      mockGetBookmarksPage.mockRejectedValueOnce(new Error("Database error"));

      const response = await GET(createRequest({ feed: "latest" }));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch bookmarks");
    });
  });
});
