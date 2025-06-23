/**
 * Tests for bookmark tag route functionality
 */

import { getBookmarksByTag } from "@/lib/bookmarks/bookmarks-data-access.server";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark, BookmarksIndex } from "@/types";

// Mock dependencies
jest.mock("@/lib/s3-utils");
jest.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  ...jest.requireActual("@/lib/bookmarks/bookmarks-data-access.server"),
  getBookmarks: jest.fn(),
}));

const mockReadJsonS3 = jest.mocked(readJsonS3);
const { getBookmarks } = jest.requireMock("@/lib/bookmarks/bookmarks-data-access.server");

describe("Tag Route Functionality", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getBookmarksByTag", () => {
    const mockBookmarks: UnifiedBookmark[] = [
      {
        id: "1",
        url: "https://example.com",
        title: "Example 1",
        description: "Test bookmark 1",
        tags: ["web-development", "react"],
        dateBookmarked: "2025-01-01",
      } as UnifiedBookmark,
      {
        id: "2",
        url: "https://example2.com",
        title: "Example 2",
        description: "Test bookmark 2",
        tags: ["web-development", "typescript"],
        dateBookmarked: "2025-01-02",
      } as UnifiedBookmark,
      {
        id: "3",
        url: "https://example3.com",
        title: "Example 3",
        description: "Test bookmark 3",
        tags: ["design", "ui"],
        dateBookmarked: "2025-01-03",
      } as UnifiedBookmark,
    ];

    it("should return cached bookmarks when available", async () => {
      const cachedPage = [mockBookmarks[0], mockBookmarks[1]];
      const mockIndex: BookmarksIndex = {
        count: 2,
        totalPages: 1,
        pageSize: 24,
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test-checksum",
      };

      // Mock cached page and index
      mockReadJsonS3
        .mockResolvedValueOnce(cachedPage) // Tag page
        .mockResolvedValueOnce(mockIndex); // Tag index

      const result = await getBookmarksByTag("web-development", 1);

      expect(result).toEqual({
        bookmarks: cachedPage,
        totalCount: 2,
        totalPages: 1,
        fromCache: true,
      });

      expect(mockReadJsonS3).toHaveBeenCalledWith(
        `${BOOKMARKS_S3_PATHS.TAG_PREFIX}web-development/page-1.json`
      );
      expect(mockReadJsonS3).toHaveBeenCalledWith(
        `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}web-development/index.json`
      );
    });

    it("should fall back to filtering all bookmarks when cache miss", async () => {
      // Mock cache miss
      mockReadJsonS3
        .mockResolvedValueOnce([]) // Empty cached page
        .mockResolvedValueOnce(null); // No index

      // Mock all bookmarks
      getBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("web-development", 1);

      expect(result).toEqual({
        bookmarks: [mockBookmarks[0], mockBookmarks[1]],
        totalCount: 2,
        totalPages: 1,
        fromCache: false,
      });

      expect(getBookmarks).toHaveBeenCalled();
    });

    it("should handle slug format conversion", async () => {
      mockReadJsonS3.mockResolvedValue([]);
      getBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("web-development", 1);

      // Should find bookmarks tagged with "web-development" (converts to "web development")
      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0]?.id).toBe("1");
      expect(result.bookmarks[1]?.id).toBe("2");
    });

    it("should handle pagination correctly", async () => {
      const largeBookmarkSet = Array(50).fill(null).map((_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example${i}.com`,
        title: `Bookmark ${i}`,
        description: `Description ${i}`,
        tags: ["test-tag"],
        dateBookmarked: "2025-01-01",
      } as UnifiedBookmark));

      mockReadJsonS3.mockResolvedValue([]);
      getBookmarks.mockResolvedValueOnce(largeBookmarkSet);

      // Request page 2
      const result = await getBookmarksByTag("test-tag", 2);

      expect(result.bookmarks).toHaveLength(24); // BOOKMARKS_PER_PAGE
      expect(result.bookmarks[0]?.id).toBe("bookmark-24"); // First item on page 2
      expect(result.totalCount).toBe(50);
      expect(result.totalPages).toBe(3); // 50 / 24 = 3 pages
      expect(result.fromCache).toBe(false);
    });

    it("should handle tag objects vs string tags", async () => {
      const mixedTagBookmarks: UnifiedBookmark[] = [
        {
          id: "1",
          url: "https://example.com",
          title: "String tags",
          description: "Has string tags",
          tags: ["software-development-tools"],
          dateBookmarked: "2025-01-01",
        } as UnifiedBookmark,
        {
          id: "2",
          url: "https://example2.com",
          title: "Object tags",
          description: "Has object tags",
          tags: [{ name: "Software Development Tools" }] as any,
          dateBookmarked: "2025-01-02",
        } as UnifiedBookmark,
      ];

      mockReadJsonS3.mockResolvedValue([]);
      getBookmarks.mockResolvedValueOnce(mixedTagBookmarks);

      const result = await getBookmarksByTag("software-development-tools", 1);

      // Should find both bookmarks regardless of tag format
      expect(result.bookmarks).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it("should handle empty results gracefully", async () => {
      mockReadJsonS3.mockResolvedValue([]);
      getBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("non-existent-tag", 1);

      expect(result).toEqual({
        bookmarks: [],
        totalCount: 0,
        totalPages: 0,
        fromCache: false,
      });
    });

    it("should handle S3 errors gracefully", async () => {
      // Mock S3 error
      mockReadJsonS3
        .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
        .mockResolvedValueOnce(null);

      getBookmarks.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("web-development", 1);

      // Should fall back to filtering all bookmarks
      expect(result.fromCache).toBe(false);
      expect(result.bookmarks).toHaveLength(2);
    });
  });
});