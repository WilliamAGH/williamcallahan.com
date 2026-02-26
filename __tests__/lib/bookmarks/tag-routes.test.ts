/**
 * Tests for bookmark tag route functionality.
 *
 * Verifies getBookmarksByTag behavior through DB query module mocks.
 */
import { vi } from "vitest";
import type { UnifiedBookmark } from "@/types";
import { getBookmarksByTag } from "@/lib/bookmarks/bookmarks-data-access.server";
import {
  getBookmarksPageByTag,
  getTagBookmarksIndexFromDatabase,
} from "@/lib/db/queries/bookmarks";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getAllBookmarks: vi.fn(),
  getBookmarkById: vi.fn(),
  getBookmarksPage: vi.fn(),
  getBookmarksPageByTag: vi.fn(),
  getBookmarksCount: vi.fn(),
  getBookmarksIndexFromDatabase: vi.fn(),
  getTagBookmarksIndexFromDatabase: vi.fn(),
  listTagSlugsFromDatabase: vi.fn(),
  searchBookmarksFts: vi.fn(),
}));

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

vi.mock("@/lib/utils/env-logger", () => ({
  envLogger: {
    log: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/bookmarks/config", () => ({
  isBookmarkServiceLoggingEnabled: false,
  LOG_PREFIX: "Bookmarks",
  BOOKMARK_SERVICE_LOG_CATEGORY: "Bookmarks",
}));

vi.mock("@/lib/cache", () => ({
  USE_NEXTJS_CACHE: false,
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

const mockGetBookmarksPageByTag = vi.mocked(getBookmarksPageByTag);
const mockGetTagBookmarksIndexFromDatabase = vi.mocked(getTagBookmarksIndexFromDatabase);

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

    it("returns page + metadata from DB index and tag query", async () => {
      mockGetTagBookmarksIndexFromDatabase.mockResolvedValueOnce({
        count: 2,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        checksum: "hash",
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        changeDetected: true,
      });
      mockGetBookmarksPageByTag.mockResolvedValueOnce(mockBookmarks);

      const result = await getBookmarksByTag("web-development", 1);

      expect(result.fromCache).toBe(true);
      expect(result.totalCount).toBe(2);
      expect(result.totalPages).toBe(1);
      expect(result.bookmarks).toEqual(mockBookmarks);
      expect(mockGetTagBookmarksIndexFromDatabase).toHaveBeenCalledWith(
        "web-development",
        BOOKMARKS_PER_PAGE,
      );
      expect(mockGetBookmarksPageByTag).toHaveBeenCalledWith(
        "web-development",
        1,
        BOOKMARKS_PER_PAGE,
      );
    });

    it("returns empty results when tag index is missing", async () => {
      mockGetTagBookmarksIndexFromDatabase.mockResolvedValueOnce(null);
      mockGetBookmarksPageByTag.mockResolvedValueOnce([]);

      const result = await getBookmarksByTag("non-existent-tag", 1);

      expect(result.fromCache).toBe(true);
      expect(result.bookmarks).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it("supports pagination using DB results", async () => {
      const totalItems = BOOKMARKS_PER_PAGE * 2 + 5;
      const pageTwoBookmarks = Array(BOOKMARKS_PER_PAGE)
        .fill(null)
        .map(
          (_, i) =>
            ({
              id: `bookmark-${i + BOOKMARKS_PER_PAGE}`,
              url: `https://example${i}.com`,
              title: `Bookmark ${i}`,
              description: `Description ${i}`,
              tags: [createTag("test-tag")],
              dateBookmarked: "2025-01-01",
            }) as UnifiedBookmark,
        );

      mockGetTagBookmarksIndexFromDatabase.mockResolvedValueOnce({
        count: totalItems,
        totalPages: Math.ceil(totalItems / BOOKMARKS_PER_PAGE),
        pageSize: BOOKMARKS_PER_PAGE,
        checksum: "hash",
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        changeDetected: true,
      });
      mockGetBookmarksPageByTag.mockResolvedValueOnce(pageTwoBookmarks);

      const result = await getBookmarksByTag("test-tag", 2);

      expect(result.totalCount).toBe(totalItems);
      expect(result.totalPages).toBe(Math.ceil(totalItems / BOOKMARKS_PER_PAGE));
      expect(result.bookmarks).toHaveLength(BOOKMARKS_PER_PAGE);
      expect(result.bookmarks[0].id).toBe(`bookmark-${BOOKMARKS_PER_PAGE}`);
    });

    it("propagates tag page query errors", async () => {
      mockGetTagBookmarksIndexFromDatabase.mockResolvedValueOnce({
        count: 1,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        checksum: "hash",
        lastModified: new Date().toISOString(),
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        changeDetected: true,
      });
      mockGetBookmarksPageByTag.mockRejectedValueOnce(new Error("DB query failed"));

      await expect(getBookmarksByTag("web-development", 1)).rejects.toThrow("DB query failed");
    });

    it("propagates tag index query errors", async () => {
      mockGetTagBookmarksIndexFromDatabase.mockRejectedValueOnce(new Error("Index query failed"));
      mockGetBookmarksPageByTag.mockResolvedValueOnce([]);

      await expect(getBookmarksByTag("web-development", 1)).rejects.toThrow("Index query failed");
    });
  });
});
