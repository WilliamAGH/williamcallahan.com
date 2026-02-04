/**
 * Tests for bookmark tag route functionality
 *
 * Tests the getBookmarksByTag function by mocking S3 store dependencies
 * instead of mocking the function itself.
 */
import { vi } from "vitest";
import type { UnifiedBookmark } from "@/types";
import { getBookmarksByTag } from "@/lib/bookmarks/bookmarks-data-access.server";
import {
  readTagBookmarksPageFromS3,
  readTagBookmarksIndexFromS3,
  readBookmarksDatasetFromS3,
} from "@/lib/bookmarks/bookmarks-s3-store";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

// Mock S3 store
vi.mock("@/lib/bookmarks/bookmarks-s3-store", () => ({
  readTagBookmarksPageFromS3: vi.fn(),
  readTagBookmarksIndexFromS3: vi.fn(),
  readBookmarksDatasetFromS3: vi.fn(),
  // Add others if needed by internal calls
  listTagSlugsFromS3: vi.fn(),
  readBookmarkByIdFromS3: vi.fn(),
  readBookmarksIndexFromS3: vi.fn(),
  readBookmarksPageFromS3: vi.fn(),
}));

// Mock cache management to control caching behavior
vi.mock("@/lib/bookmarks/cache-management.server", () => ({
  getFullDatasetCache: vi.fn().mockReturnValue(null),
  setFullDatasetCache: vi.fn(),
  safeCacheLife: vi.fn(),
  safeCacheTag: vi.fn(),
  getCachedBookmarkById: vi.fn(),
  setCachedBookmarkById: vi.fn(),
  invalidateBookmarkByIdCaches: vi.fn(),
  invalidateNextJsBookmarksCache: vi.fn(),
  invalidatePageCache: vi.fn(),
  invalidateTagCache: vi.fn(),
  invalidateBookmarkMemoryCache: vi.fn(),
  clearFullDatasetCache: vi.fn(),
}));

// Mock env logger to silence logs
vi.mock("@/lib/utils/env-logger", () => ({
  envLogger: {
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config to ensure we are not in CLI mode
vi.mock("@/lib/bookmarks/config", () => ({
  isBookmarkServiceLoggingEnabled: false,
  LOG_PREFIX: "Bookmarks",
  BOOKMARK_SERVICE_LOG_CATEGORY: "Bookmarks",
}));

// Mock cache to ensure we use Next.js cache or not as needed
// But getBookmarksByTag uses USE_NEXTJS_CACHE constant.
// We can't easily change the constant if it's imported.
// However, the helpers `getTagBookmarksPage` use `USE_NEXTJS_CACHE`.
// We can mock `@/lib/cache`
vi.mock("@/lib/cache", () => ({
  USE_NEXTJS_CACHE: false, // Disable Next.js cache to hit "Direct" functions
  isCliLikeCacheContext: () => false,
  withCacheFallback: async <T>(
    cachedFn: () => Promise<T>,
    _fallbackFn: () => Promise<T>,
  ): Promise<T> => cachedFn(),
  cacheContextGuards: {
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
  },
}));

const mockReadTagBookmarksPageFromS3 = vi.mocked(readTagBookmarksPageFromS3);
const mockReadTagBookmarksIndexFromS3 = vi.mocked(readTagBookmarksIndexFromS3);
const mockReadBookmarksDatasetFromS3 = vi.mocked(readBookmarksDatasetFromS3);

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

    it("should return cached bookmarks when available in S3 page cache", async () => {
      // Mock S3 page hit
      mockReadTagBookmarksPageFromS3.mockResolvedValueOnce(mockBookmarks);
      // Mock S3 index hit for metadata
      mockReadTagBookmarksIndexFromS3.mockResolvedValueOnce({
        count: 2,
        totalPages: 1,
        pageSize: 24,
        checksum: "hash",
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
      });

      const result = await getBookmarksByTag("web-development", 1);

      expect(result.fromCache).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(1);
      // It should have called the page reader
      expect(mockReadTagBookmarksPageFromS3).toHaveBeenCalledWith("web-development", 1);
    });

    it("should return non-cached bookmarks when S3 cache miss (fallback to full dataset)", async () => {
      // Mock S3 page miss
      mockReadTagBookmarksPageFromS3.mockResolvedValueOnce(null);
      // Mock full dataset hit
      mockReadBookmarksDatasetFromS3.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("web-development", 1);

      expect(result.fromCache).toBe(false);
      expect(result.totalCount).toBe(2);
      expect(mockReadBookmarksDatasetFromS3).toHaveBeenCalled();
    });

    it("should handle pagination correctly via full dataset filtering", async () => {
      // Mock S3 page miss
      mockReadTagBookmarksPageFromS3.mockResolvedValueOnce(null);

      // Create enough bookmarks to span 3 pages (using actual BOOKMARKS_PER_PAGE = 24)
      // 24 * 2 + 5 = 53 items → Math.ceil(53/24) = 3 pages
      const totalItems = BOOKMARKS_PER_PAGE * 2 + 5;

      const largeBookmarkSet = Array(totalItems)
        .fill(null)
        .map(
          (_, i) =>
            ({
              id: `bookmark-${i}`,
              url: `https://example${i}.com`,
              title: `Bookmark ${i}`,
              description: `Description ${i}`,
              tags: [createTag("test-tag")],
              dateBookmarked: "2025-01-01",
            }) as UnifiedBookmark,
        );

      mockReadBookmarksDatasetFromS3.mockResolvedValueOnce(largeBookmarkSet);

      // Request page 2
      const result = await getBookmarksByTag("test-tag", 2);

      expect(result.totalCount).toBe(totalItems);
      // Expected total pages: Math.ceil(53/24) = 3
      expect(result.totalPages).toBe(Math.ceil(totalItems / BOOKMARKS_PER_PAGE));
      // Page 2 should have BOOKMARKS_PER_PAGE items (24)
      expect(result.bookmarks).toHaveLength(BOOKMARKS_PER_PAGE);
      // Verify correct item offset (page 1 has 0..23, page 2 starts at 24)
      expect(result.bookmarks[0].id).toBe(`bookmark-${BOOKMARKS_PER_PAGE}`);
    });

    it("should handle empty results gracefully", async () => {
      // Mock S3 page miss
      mockReadTagBookmarksPageFromS3.mockResolvedValueOnce(null);
      // Mock full dataset (empty or no match)
      mockReadBookmarksDatasetFromS3.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("non-existent-tag", 1);

      expect(result.bookmarks).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("should handle errors gracefully", async () => {
      // Mock S3 page throws error
      mockReadTagBookmarksPageFromS3.mockRejectedValueOnce(new Error("S3 connection failed"));

      await expect(getBookmarksByTag("web-development", 1)).rejects.toThrow("S3 connection failed");
    });
  });
});
