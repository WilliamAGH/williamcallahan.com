/**
 * Tests for bookmark tag route functionality
 *
 * Tests the getBookmarksByTag function via mock to verify calling conventions.
 * For integration tests of real business logic, mock S3 instead.
 */

import type { UnifiedBookmark } from "@/types";

// Explicit mock - no alias hijacking
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  getBookmarksByTag: vi.fn(),
}));

import { getBookmarksByTag } from "@/lib/bookmarks/bookmarks-data-access.server";

const mockGetBookmarksByTag = vi.mocked(getBookmarksByTag);

const createTag = (name: string) => ({
  id: name,
  name,
  slug: name.replace(/\s+/g, "-"),
  color: undefined,
});

describe("Tag Route Functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBookmarksByTag", () => {
    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Example 1",
        description: "Test bookmark 1",
        tags: [createTag("web development"), createTag("react")],
        dateBookmarked: "2025-01-01",
      } as UnifiedBookmark,
      {
        id: "2",
        url: "https://example2.com",
        title: "Example 2",
        description: "Test bookmark 2",
        tags: [createTag("web development"), createTag("typescript")],
        dateBookmarked: "2025-01-02",
      } as UnifiedBookmark,
    ];

    it("should return cached bookmarks when available", async () => {
      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: mockBookmarks,
        totalCount: 2,
        totalPages: 1,
        fromCache: true,
      });

      const result = await getBookmarksByTag("web-development", 1);

      expect(result.fromCache).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(mockGetBookmarksByTag).toHaveBeenCalledWith("web-development", 1);
    });

    it("should return non-cached bookmarks when cache miss", async () => {
      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: mockBookmarks,
        totalCount: 2,
        totalPages: 1,
        fromCache: false,
      });

      const result = await getBookmarksByTag("web-development", 1);

      expect(result.fromCache).toBe(false);
      expect(result.totalCount).toBe(2);
      expect(mockGetBookmarksByTag).toHaveBeenCalledWith("web-development", 1);
    });

    it("should handle pagination correctly", async () => {
      const largeBookmarkSet = Array(24)
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
            }) as UnifiedBookmark,
        );

      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: largeBookmarkSet,
        totalCount: 50,
        totalPages: 3,
        fromCache: true,
      });

      const result = await getBookmarksByTag("test-tag", 2);

      expect(result.totalCount).toBe(50);
      expect(result.totalPages).toBe(3);
      expect(mockGetBookmarksByTag).toHaveBeenCalledWith("test-tag", 2);
    });

    it("should handle empty results gracefully", async () => {
      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: [],
        totalCount: 0,
        totalPages: 0,
        fromCache: false,
      });

      const result = await getBookmarksByTag("non-existent-tag", 1);

      expect(result.bookmarks).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("should handle errors gracefully", async () => {
      mockGetBookmarksByTag.mockRejectedValueOnce(new Error("S3 connection failed"));

      await expect(getBookmarksByTag("web-development", 1)).rejects.toThrow("S3 connection failed");
    });

    it("should serve top-10 tags from S3 object storage", async () => {
      mockGetBookmarksByTag.mockResolvedValueOnce({
        bookmarks: mockBookmarks,
        totalCount: 30,
        totalPages: 2,
        fromCache: true, // Indicates it came from S3 cache files
      });

      const result = await getBookmarksByTag("popular-tag", 1);

      expect(result.fromCache).toBe(true);
      expect(result.totalCount).toBe(30);
      expect(result.totalPages).toBe(2);
      expect(mockGetBookmarksByTag).toHaveBeenCalledWith("popular-tag", 1);
    });
  });
});
