/**
 * Tests for bookmark API tag filtering functionality
 */

import { GET } from "@/app/api/bookmarks/route";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { readJsonS3 } from "@/lib/s3-utils";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";

// Mock dependencies
jest.mock("@/lib/bookmarks/service.server");
jest.mock("@/lib/s3-utils");
jest.mock("@/lib/bookmarks/slug-manager");

const mockGetBookmarks = jest.mocked(getBookmarks);
const mockReadJsonS3 = jest.mocked(readJsonS3);
const mockLoadSlugMapping = jest.mocked(loadSlugMapping);

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
    jest.clearAllMocks();
    console.log = jest.fn(); // Suppress console logs in tests
    // Set up default slug mapping mock
    mockLoadSlugMapping.mockResolvedValue(createMockSlugMapping(mockBookmarks));
  });

  afterEach(() => {
    // Restore original console.log
    console.log = jest.requireActual("console").log;
  });

  describe("Tag parameter handling", () => {
    it("should filter bookmarks by tag in slug format", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=web-development",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "web-development" }),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
      expect(data.meta.filter).toEqual({ tag: "web-development" });
    });

    it("should handle multi-word tags with hyphens", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=software-development-tools",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "software-development-tools" }),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("2");
    });

    it("should handle URL-encoded tags", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=web%20development",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "web development" }),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
    });

    it("should perform case-insensitive tag matching", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=WEB-DEVELOPMENT",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "WEB-DEVELOPMENT" }),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].id).toBe("1");
    });

    it("should return empty array for non-existent tags", async () => {
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=non-existent-tag",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "non-existent-tag" }),
        },
      } as any;

      const response = await GET(request);
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

      mockGetBookmarks.mockResolvedValueOnce(largeSet);
      mockReadJsonS3.mockResolvedValueOnce({
        count: largeSet.length,
        lastFetchedAt: Date.now(),
      });
      // Override default slug mapping for this test's larger dataset
      mockLoadSlugMapping.mockResolvedValueOnce(createMockSlugMapping(largeSet));

      const request = {
        url: "http://localhost:3000/api/bookmarks?tag=test-tag&page=2&limit=20",
        nextUrl: {
          searchParams: new URLSearchParams({ tag: "test-tag", page: "2", limit: "20" }),
        },
      } as any;

      const response = await GET(request);
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
      mockGetBookmarks.mockResolvedValueOnce(mockBookmarks);
      mockReadJsonS3.mockResolvedValueOnce({
        count: mockBookmarks.length,
        totalPages: 1,
        lastFetchedAt: Date.now(),
      });

      const request = {
        url: "http://localhost:3000/api/bookmarks",
        nextUrl: {
          searchParams: new URLSearchParams(),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.meta.filter).toBeUndefined();
    });
  });

  describe("Error handling", () => {
    it("should handle errors gracefully", async () => {
      mockGetBookmarks.mockRejectedValueOnce(new Error("Database error"));

      const request = {
        url: "http://localhost:3000/api/bookmarks",
        nextUrl: {
          searchParams: new URLSearchParams(),
        },
      } as any;

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch bookmarks");
      expect(data.details).toBe("Database error");
    });
  });
});
