/**
 * Tests for bookmark tag route functionality
 */

import { getBookmarksByTag } from "@/lib/bookmarks/bookmarks-data-access.server";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark, BookmarksIndex } from "@/types";

// Mock dependencies
jest.mock("@/lib/s3-utils");

const mockReadJsonS3 = jest.mocked(readJsonS3);

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
        tags: ["web development", "react"],
        dateBookmarked: "2025-01-01",
      } as UnifiedBookmark,
      {
        id: "2",
        url: "https://example2.com",
        title: "Example 2",
        description: "Test bookmark 2",
        tags: ["web development", "typescript"],
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

      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}web-development/page-1.json`);
      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}web-development/index.json`);
    });

    it("should fall back to filtering all bookmarks when cache miss", async () => {
      // Use a more flexible mock that returns data based on the path
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/web-development/page-1.json")) {
          return Promise.resolve([]); // Empty cached page - cache miss
        }
        if (path.includes("/tags-test/web-development/index.json")) {
          return Promise.resolve(null); // No index
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mockBookmarks); // Full bookmarks file
        }
        return Promise.resolve(null);
      });

      const result = await getBookmarksByTag("web-development", 1);

      expect(result).toEqual({
        bookmarks: [mockBookmarks[0], mockBookmarks[1]],
        totalCount: 2,
        totalPages: 1,
        fromCache: false,
      });

      // Verify S3 was called for cache check and then for full bookmarks
      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}web-development/page-1.json`);
      expect(mockReadJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
    });

    it("should handle slug format conversion", async () => {
      // Use flexible mock
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/")) {
          return Promise.resolve(path.includes("/page-") ? [] : null); // Cache miss
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mockBookmarks);
        }
        return Promise.resolve(null);
      });

      const result = await getBookmarksByTag("web-development", 1);

      // Should find bookmarks tagged with "web-development" (converts to "web development")
      expect(result.bookmarks).toHaveLength(2);
      expect(result.bookmarks[0]?.id).toBe("1");
      expect(result.bookmarks[1]?.id).toBe("2");
    });

    it("should handle pagination correctly", async () => {
      const largeBookmarkSet = Array(50)
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

      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/")) {
          return Promise.resolve(path.includes("/page-") ? [] : null); // Cache miss
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(largeBookmarkSet);
        }
        return Promise.resolve(null);
      });

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
          tags: ["software development tools"],
          dateBookmarked: "2025-01-01",
        } as UnifiedBookmark,
        {
          id: "2",
          url: "https://example2.com",
          title: "Object tags",
          description: "Has object tags",
          tags: [{ name: "software development tools" }] as any,
          dateBookmarked: "2025-01-02",
        } as UnifiedBookmark,
      ];

      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/")) {
          return Promise.resolve(path.includes("/page-") ? [] : null); // Cache miss
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mixedTagBookmarks);
        }
        return Promise.resolve(null);
      });

      const result = await getBookmarksByTag("software-development-tools", 1);

      // Should find both bookmarks regardless of tag format
      expect(result.bookmarks).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it("should handle empty results gracefully", async () => {
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/")) {
          return Promise.resolve(path.includes("/page-") ? [] : null); // Cache miss
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mockBookmarks);
        }
        return Promise.resolve(null);
      });

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
      let callCount = 0;
      mockReadJsonS3.mockImplementation((path: string) => {
        callCount++;
        if (callCount === 1) {
          // First call fails with S3 error
          const error = new Error("Not Found");
          (error as any).$metadata = { httpStatusCode: 404 };
          return Promise.reject(error);
        }
        if (path.includes("/tags-test/")) {
          return Promise.resolve(null); // No index
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(mockBookmarks);
        }
        return Promise.resolve(null);
      });

      const result = await getBookmarksByTag("web-development", 1);

      // Should fall back to filtering all bookmarks
      expect(result.fromCache).toBe(false);
      expect(result.bookmarks).toHaveLength(2);
    });

    it("should handle both top-10 cached tags and non-cached tags correctly", async () => {
      // Create a realistic dataset with various tags
      const allBookmarks: UnifiedBookmark[] = [
        // Popular tags (would be in top 10)
        ...Array(20)
          .fill(null)
          .map(
            (_, i) =>
              ({
                id: `react-${i}`,
                url: `https://react${i}.com`,
                title: `React Resource ${i}`,
                description: `React bookmark ${i}`,
                tags: ["react", "javascript"],
                dateBookmarked: "2025-01-01",
              }) as UnifiedBookmark,
          ),
        ...Array(15)
          .fill(null)
          .map(
            (_, i) =>
              ({
                id: `typescript-${i}`,
                url: `https://typescript${i}.com`,
                title: `TypeScript Resource ${i}`,
                description: `TypeScript bookmark ${i}`,
                tags: ["typescript", "programming"],
                dateBookmarked: "2025-01-02",
              }) as UnifiedBookmark,
          ),
        // Less popular tag (not in top 10)
        {
          id: "obscure-1",
          url: "https://obscure-framework.com",
          title: "Obscure Framework Guide",
          description: "A guide to an obscure framework",
          tags: ["obscure framework", "niche"],
          dateBookmarked: "2025-01-03",
        } as UnifiedBookmark,
      ];

      // Test 1: Popular tag (cached in S3)
      const cachedReactBookmarks = allBookmarks.filter((b) => b.tags.includes("react")).slice(0, 24); // First page

      const reactIndex: BookmarksIndex = {
        count: 20,
        totalPages: 1,
        pageSize: 24,
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "react-checksum",
      };

      // Mock for popular tag that would be cached
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path === `${BOOKMARKS_S3_PATHS.TAG_PREFIX}react/page-1.json`) {
          return Promise.resolve(cachedReactBookmarks);
        }
        if (path === `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}react/index.json`) {
          return Promise.resolve(reactIndex);
        }
        return Promise.resolve(null);
      });

      const reactResult = await getBookmarksByTag("react", 1);

      expect(reactResult).toEqual({
        bookmarks: cachedReactBookmarks,
        totalCount: 20,
        totalPages: 1,
        fromCache: true,
      });

      // Verify S3 was queried for the cached tag
      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}react/page-1.json`);
      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}react/index.json`);

      // Verify only cache reads were called, not the full bookmarks file
      expect(mockReadJsonS3).toHaveBeenCalledTimes(2); // Only page and index

      // CRITICAL: Verify that top-10 tags ARE served from S3 object storage
      // The mock was called and returned data from S3 storage
      expect(mockReadJsonS3).toHaveBeenCalled();
      expect(reactResult.bookmarks).toEqual(cachedReactBookmarks); // Data came from S3
      expect(reactResult.fromCache).toBe(true); // Indicates it came from S3 cache files

      // Reset mocks for next test
      jest.clearAllMocks();

      // Test 2: Unpopular tag (NOT cached in S3)
      // For non-cached tag, it will read the full bookmarks file
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path.includes("/tags-test/obscure-framework/")) {
          return Promise.resolve(path.includes("/page-") ? [] : null); // Not cached
        }
        if (path === BOOKMARKS_S3_PATHS.FILE) {
          return Promise.resolve(allBookmarks);
        }
        return Promise.resolve(null);
      });

      const obscureResult = await getBookmarksByTag("obscure-framework", 1);

      expect(obscureResult).toEqual({
        bookmarks: [
          {
            id: "obscure-1",
            url: "https://obscure-framework.com",
            title: "Obscure Framework Guide",
            description: "A guide to an obscure framework",
            tags: ["obscure framework", "niche"],
            dateBookmarked: "2025-01-03",
          },
        ],
        totalCount: 1,
        totalPages: 1,
        fromCache: false,
      });

      // Verify S3 was queried first (checking for cache)
      expect(mockReadJsonS3).toHaveBeenCalledWith(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}obscure-framework/page-1.json`);

      // Verify it read the full bookmarks file from S3 for non-cached tag
      expect(mockReadJsonS3).toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
      
      // CRITICAL: Verify that non-top-10 tags ALSO use S3 object storage
      // Just from a different file (the full bookmarks file)
      expect(mockReadJsonS3).toHaveBeenCalled();
      expect(obscureResult.bookmarks.length).toBe(1); // Data filtered from S3 full file
      expect(obscureResult.fromCache).toBe(false); // Indicates it came from full file, not cache
    });

    it("should serve top-10 tags from S3 object storage (not in-memory cache)", async () => {
      // This test verifies that even popular tags (top 10) are fetched from S3
      // when not in any in-memory cache - proving they are CAPABLE of being
      // served from S3 object storage
      
      const popularBookmarks = Array(30).fill(null).map((_, i) => ({
        id: `popular-${i}`,
        url: `https://popular${i}.com`,
        title: `Popular Resource ${i}`,
        description: `Popular bookmark ${i}`,
        tags: ["popular tag", "trending"],
        dateBookmarked: "2025-01-01",
      } as UnifiedBookmark));

      const cachedPopularPage = popularBookmarks.slice(0, 24); // First page
      
      const popularIndex: BookmarksIndex = {
        count: 30,
        totalPages: 2,
        pageSize: 24,
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "popular-checksum",
      };

      // Mock S3 to return the cached popular tag data
      mockReadJsonS3.mockImplementation((path: string) => {
        if (path === `${BOOKMARKS_S3_PATHS.TAG_PREFIX}popular-tag/page-1.json`) {
          return Promise.resolve(cachedPopularPage);
        }
        if (path === `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}popular-tag/index.json`) {
          return Promise.resolve(popularIndex);
        }
        return Promise.resolve(null);
      });

      // Call getBookmarksByTag - simulating NO in-memory cache
      const result = await getBookmarksByTag("popular-tag", 1);

      // Verify the result
      expect(result).toEqual({
        bookmarks: cachedPopularPage,
        totalCount: 30,
        totalPages: 2,
        fromCache: true,
      });

      // CRITICAL VERIFICATION: Top-10 tags ARE served from S3 object storage
      expect(mockReadJsonS3).toHaveBeenCalledWith(
        `${BOOKMARKS_S3_PATHS.TAG_PREFIX}popular-tag/page-1.json`
      );
      expect(mockReadJsonS3).toHaveBeenCalledWith(
        `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}popular-tag/index.json`
      );
      
      // Verify data was successfully retrieved from S3
      expect(result.bookmarks).toHaveLength(24);
      expect(result.bookmarks[0].tags).toContain("popular tag");
      
      // Verify ONLY S3 tag cache was used, not the full bookmarks file
      expect(mockReadJsonS3).not.toHaveBeenCalledWith(BOOKMARKS_S3_PATHS.FILE);
      expect(mockReadJsonS3).toHaveBeenCalledTimes(2);
    });
  });
});
