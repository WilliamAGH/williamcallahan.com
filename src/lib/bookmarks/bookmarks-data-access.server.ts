/** Bookmarks data access: In-memory → S3 → External API */

import { BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import type { UnifiedBookmark } from "@/types";
import {
  type BookmarksIndex,
  type BookmarkLoadOptions,
  type LightweightBookmark,
} from "@/types/bookmark";
import { tagToSlug } from "@/lib/utils/tag-utils";
import {
  normalizeBookmarkTags,
  stripImageData,
  normalizePageBookmarkTags,
} from "@/lib/bookmarks/utils";
import {
  isBookmarkServiceLoggingEnabled,
  LOG_PREFIX,
  BOOKMARK_SERVICE_LOG_CATEGORY,
} from "@/lib/bookmarks/config";
import { getEnvironment } from "@/lib/config/environment";
import { USE_NEXTJS_CACHE, isCliLikeCacheContext, withCacheFallback } from "@/lib/cache";
import {
  listTagSlugsFromS3,
  readBookmarkByIdFromS3,
  readBookmarksDatasetFromS3,
  readBookmarksIndexFromS3,
  readBookmarksPageFromS3,
  readTagBookmarksIndexFromS3,
  readTagBookmarksPageFromS3,
} from "@/lib/bookmarks/bookmarks-s3-store";

// Runtime-safe cache wrappers imported from cache-management
import {
  safeCacheLife,
  safeCacheTag,
  getCachedBookmarkById,
  setCachedBookmarkById,
  getFullDatasetCache,
  setFullDatasetCache,
  clearFullDatasetCache,
  invalidateBookmarkByIdCaches,
  invalidateNextJsBookmarksCache,
  invalidatePageCache,
  invalidateTagCache as invalidateTagCacheInternal,
  invalidateBookmarkMemoryCache as invalidateBookmarkCacheInternal,
} from "@/lib/bookmarks/cache-management.server";

const isCliLikeContext = isCliLikeCacheContext;
const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;

// Cache logic moved to cache-management.server.ts

import {
  refreshAndPersistBookmarks,
  releaseRefreshLock,
} from "@/lib/bookmarks/refresh-logic.server";

/**
 * Fetches bookmarks with Next.js caching layer.
 * Cache duration: 1 hour (coordinated with 2-hour scheduler to minimize staleness).
 * Max staleness: ~3 hours (1h cache + 2h schedule + 15min jitter).
 * @param options - Control data inclusion and fetch behavior
 * @returns Full or lightweight bookmarks depending on options
 */
async function fetchAndCacheBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  "use cache";
  // Cache for 1 hour to coordinate with 2-hour scheduler runs.
  // This ensures data refreshes between scheduler cycles.
  safeCacheLife({ revalidate: 3600 }); // 1 hour
  safeCacheTag("bookmarks-s3-full");
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  logBookmarkDataAccessEvent("fetchAndCacheBookmarks", {
    skipExternalFetch,
    includeImageData,
    force,
  });

  // --- 1. Prefer S3 in production runtime; avoid local fallbacks ---
  const isProductionRuntime =
    getEnvironment() === "production" &&
    !isCliLikeContext() &&
    process.env.NEXT_PHASE !== "phase-production-build";
  const isTestEnvironment =
    process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.TEST === "true";
  if (isProductionRuntime) {
    // Explicitly log that we are skipping local fallback in production runtime.
    envLogger.log(
      "Skipping local bookmarks fallback in production runtime; using S3-only strategy",
      undefined,
      {
        category: LOG_PREFIX,
      },
    );
  } else if (isTestEnvironment) {
    envLogger.debug(
      "Test environment detected; skipping local fallbacks for bookmarks",
      undefined,
      {
        category: LOG_PREFIX,
      },
    );
  }

  // --- 2. Read from S3 ---
  const formatBookmarks = (dataset: UnifiedBookmark[], source: string) => {
    if (!includeImageData) {
      logBookmarkDataAccessEvent(`Stripping image data from ${source} bookmarks`, {
        bookmarkCount: dataset.length,
      });
      return dataset.map(stripImageData);
    }
    return dataset.map(normalizeBookmarkTags);
  };

  // readBookmarksDatasetFromS3 returns null for S3NotFoundError (expected),
  // and re-throws service errors. Let service errors propagate to callers.
  const s3Data = await readBookmarksDatasetFromS3();
  const bookmarksFromS3 = s3Data && Array.isArray(s3Data) && s3Data.length > 0 ? s3Data : null;

  if (bookmarksFromS3) {
    logBookmarkDataAccessEvent("Loaded bookmarks from S3", {
      bookmarkCount: bookmarksFromS3.length,
    });
    if (process.env.DEBUG_BOOKMARKS === "true") {
      const cliBookmark = bookmarksFromS3.find((b) => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
      if (cliBookmark) {
        logBookmarkDataAccessEvent("CLI bookmark content exists", {
          hasContent: !!cliBookmark.content,
          hasScreenshotAssetId: !!cliBookmark.content?.screenshotAssetId,
          screenshotAssetId: cliBookmark.content?.screenshotAssetId,
          contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
        });
      }
    }
    return formatBookmarks(bookmarksFromS3, "S3");
  }

  logBookmarkDataAccessEvent("No bookmarks in S3; attempting refresh");
  if (skipExternalFetch) return [];
  const refreshedBookmarks = await refreshAndPersistBookmarks(force);
  if (!refreshedBookmarks) return [];
  if (!includeImageData) {
    logBookmarkDataAccessEvent("Stripping image data from refreshed bookmarks", {
      bookmarkCount: refreshedBookmarks.length,
    });
    return refreshedBookmarks.map(stripImageData);
  }
  return refreshedBookmarks.map(normalizeBookmarkTags);
}

async function getBookmarksPageDirect(pageNumber: number): Promise<UnifiedBookmark[]> {
  // readBookmarksPageFromS3 returns null for S3NotFoundError (page doesn't exist),
  // and re-throws service errors. Let service errors propagate to callers.
  const pageData = await readBookmarksPageFromS3(pageNumber);
  return pageData ? normalizePageBookmarkTags(pageData) : [];
}

/**
 * Gets a paginated bookmarks page with caching.
 * Cache duration: 1 day (pages rarely change, reduces S3 reads).
 * @param pageNumber - Page number to fetch (1-indexed)
 * @returns Bookmarks for the specified page
 */
async function getCachedBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 86400 }); // 1 day - pagination rarely changes
  safeCacheTag("bookmarks", `bookmarks-page-${pageNumber}`);
  return getBookmarksPageDirect(pageNumber);
}

export async function getBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  if (isProductionBuildPhase()) {
    return getCachedBookmarksPage(pageNumber);
  }

  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedBookmarksPage(pageNumber),
        () => getBookmarksPageDirect(pageNumber),
      )
    : getBookmarksPageDirect(pageNumber);
}

async function getTagBookmarksPageDirect(
  tagSlug: string,
  pageNumber: number,
): Promise<UnifiedBookmark[]> {
  // readTagBookmarksPageFromS3 returns null for S3NotFoundError (page doesn't exist),
  // and re-throws service errors. Let service errors propagate to callers.
  const pageData = await readTagBookmarksPageFromS3(tagSlug, pageNumber);
  return pageData ? normalizePageBookmarkTags(pageData) : [];
}

/**
 * Gets bookmarks for a specific tag with caching.
 * Cache duration: 1 hour (aligned with main cache for consistency).
 * @param tagSlug - URL-safe tag identifier
 * @param pageNumber - Page number within tag results
 * @returns Bookmarks matching the tag
 */
async function getCachedTagBookmarksPage(
  tagSlug: string,
  pageNumber: number,
): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - aligned with main bookmark cache
  safeCacheTag(
    "bookmarks",
    `bookmarks-tag-${tagSlug}`,
    `bookmarks-tag-${tagSlug}-page-${pageNumber}`,
  );
  return getTagBookmarksPageDirect(tagSlug, pageNumber);
}

export async function getTagBookmarksPage(
  tagSlug: string,
  pageNumber: number,
): Promise<UnifiedBookmark[]> {
  if (isProductionBuildPhase()) {
    return getCachedTagBookmarksPage(tagSlug, pageNumber);
  }

  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedTagBookmarksPage(tagSlug, pageNumber),
        () => getTagBookmarksPageDirect(tagSlug, pageNumber),
      )
    : getTagBookmarksPageDirect(tagSlug, pageNumber);
}

async function getTagBookmarksIndexDirect(tagSlug: string): Promise<BookmarksIndex | null> {
  // readTagBookmarksIndexFromS3 returns null for S3NotFoundError (index doesn't exist),
  // and re-throws service errors. Let service errors propagate to callers.
  return readTagBookmarksIndexFromS3(tagSlug);
}

/**
 * Gets tag-specific bookmarks index with caching.
 * Cache duration: 1 hour (matches tag pages for consistency).
 * @param tagSlug - URL-safe tag identifier
 * @returns Index metadata for tag bookmarks
 */
async function getCachedTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - consistent with tag pages
  safeCacheTag("bookmarks", `bookmarks-tag-${tagSlug}`, `bookmarks-tag-${tagSlug}-index`);
  return getTagBookmarksIndexDirect(tagSlug);
}

export async function getTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  if (isProductionBuildPhase()) {
    return getCachedTagBookmarksIndex(tagSlug);
  }

  if (USE_NEXTJS_CACHE) {
    try {
      const cached = await getCachedTagBookmarksIndex(tagSlug);
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    return getTagBookmarksIndexDirect(tagSlug);
  }
  return getTagBookmarksIndexDirect(tagSlug);
}

export async function listTagSlugs(): Promise<string[]> {
  if (isProductionBuildPhase()) {
    return listTagSlugsCached();
  }
  return listTagSlugsFromS3();
}

async function listTagSlugsCached(): Promise<string[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 });
  safeCacheTag("bookmarks", "bookmarks-tag-slugs");
  return listTagSlugsFromS3();
}

async function getBookmarksIndexDirect(): Promise<BookmarksIndex | null> {
  // readBookmarksIndexFromS3 returns null for S3NotFoundError (index doesn't exist),
  // and re-throws service errors. Let service errors propagate to callers.
  return readBookmarksIndexFromS3();
}

/**
 * Gets main bookmarks index with caching.
 * Cache duration: 1 hour (coordinates with scheduler for fresh counts).
 * @returns Index with count, pages, checksum, and freshness timestamps
 */
async function getCachedBookmarksIndex(): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - ensures fresh counts between scheduler runs
  safeCacheTag("bookmarks", "bookmarks-index");
  return getBookmarksIndexDirect();
}

/**
 * Get all bookmarks with de-duplication of in-flight requests.
 * Service errors propagate to callers - they can distinguish between
 * empty results (no bookmarks) and failures (S3 service errors).
 */
export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  if (inFlightGetPromise) return inFlightGetPromise;
  inFlightGetPromise = fetchAndCacheBookmarks(options);
  try {
    return await inFlightGetPromise;
  } finally {
    inFlightGetPromise = null;
  }
}

export async function getBookmarkById(
  bookmarkId: string,
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark | LightweightBookmark | null> {
  const includeImageData = options.includeImageData ?? true;
  // Check memory cache first
  if (includeImageData) {
    const cached = getCachedBookmarkById(bookmarkId, false);
    if (cached) {
      return cached;
    }
  } else {
    const cached = getCachedBookmarkById(bookmarkId, true);
    if (cached) {
      return cached;
    }
  }

  let bookmark: UnifiedBookmark | null = null;

  if (!bookmark) {
    bookmark = await readBookmarkByIdFromS3(bookmarkId);
  }

  if (!bookmark) {
    envLogger.log(
      "Per-bookmark JSON missing in S3. Falling back to scanning full dataset.",
      { bookmarkId },
      { category: LOG_PREFIX },
    );
    const allBookmarks = (await getBookmarks({
      includeImageData: true,
      skipExternalFetch: options.skipExternalFetch ?? DEFAULT_BOOKMARK_OPTIONS.skipExternalFetch,
      force: options.force ?? DEFAULT_BOOKMARK_OPTIONS.force,
    })) as UnifiedBookmark[];
    bookmark = allBookmarks.find((b) => b.id === bookmarkId) ?? null;
  }

  if (!bookmark) {
    return null;
  }

  if (includeImageData) {
    setCachedBookmarkById(bookmarkId, bookmark, false);
    return bookmark;
  }

  const lightweight = stripImageData(bookmark);
  setCachedBookmarkById(bookmarkId, lightweight, true);
  return lightweight;
}

/** Get bookmarks by tag with caching support */
export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
): Promise<{
  bookmarks: UnifiedBookmark[];
  totalCount: number;
  totalPages: number;
  fromCache: boolean;
}> {
  logBookmarkDataAccessEvent("getBookmarksByTag invoked", { tagSlug, pageNumber });
  const cachedPage = await getTagBookmarksPage(tagSlug, pageNumber);
  if (cachedPage.length > 0) {
    const index = await getTagBookmarksIndex(tagSlug);
    logBookmarkDataAccessEvent("Serving tag page from cache", {
      tagSlug,
      pageNumber,
      count: cachedPage.length,
    });
    return {
      bookmarks: cachedPage,
      totalCount: index?.count || cachedPage.length,
      totalPages: index?.totalPages || 1,
      fromCache: true,
    };
  }
  logBookmarkDataAccessEvent("Tag page cache miss, filtering full dataset", {
    tagSlug,
    pageNumber,
  });

  // Check in-memory runtime cache first to avoid repeated S3 reads.
  // In test environment, bypass the in-process cache so each test can
  // provide different mocked datasets deterministically.
  let allBookmarks: UnifiedBookmark[];
  const bypassMemoryCache = process.env.NODE_ENV === "test";

  const cachedDataset = !bypassMemoryCache ? getFullDatasetCache() : null;

  if (cachedDataset) {
    // Note: getFullDatasetCache handles TTL internally
    envLogger.log("Using in-memory runtime cache for full bookmarks dataset", undefined, {
      category: LOG_PREFIX,
    });
    allBookmarks = cachedDataset;
  } else {
    envLogger.log("Reading full bookmarks dataset from S3 persistence", undefined, {
      category: LOG_PREFIX,
    });
    allBookmarks = (await getBookmarks({
      includeImageData: true,
      skipExternalFetch: false,
      force: false,
    } satisfies BookmarkLoadOptions)) as UnifiedBookmark[];

    if (!bypassMemoryCache) {
      // Update in-memory runtime cache
      setFullDatasetCache(allBookmarks);
    }
  }
  const filteredBookmarks = allBookmarks.filter((b) => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some((t) => {
      const tagName = typeof t === "string" ? t : (t as { name: string }).name;
      return tagToSlug(tagName) === tagSlug;
    });
  });
  const totalCount = filteredBookmarks.length,
    totalPages = Math.ceil(totalCount / BOOKMARKS_PER_PAGE);
  const start = (pageNumber - 1) * BOOKMARKS_PER_PAGE,
    paginated = filteredBookmarks.slice(start, start + BOOKMARKS_PER_PAGE);
  logBookmarkDataAccessEvent("Tag page generated via filtered dataset", {
    tagSlug,
    pageNumber,
    count: paginated.length,
  });
  return { bookmarks: paginated, totalCount, totalPages, fromCache: false };
}

/** Cache invalidation functions (Next.js cache and in-memory runtime cache) */
export const invalidateBookmarksCache = (): void => {
  // Clear in-memory runtime cache (full dataset and per-ID caches)
  clearFullDatasetCache();
  invalidateBookmarkByIdCaches();
  invalidateNextJsBookmarksCache();
};
export const invalidateBookmarksPageCache = (pageNumber: number): void => {
  invalidatePageCache(pageNumber);
  logBookmarkDataAccessEvent("Cache invalidated for bookmarks page", { pageNumber });
};
export const invalidateBookmarksTagCache = (tagSlug: string): void => {
  invalidateTagCacheInternal(tagSlug);
  logBookmarkDataAccessEvent("Cache invalidated for tag", { tagSlug });
};
export const invalidateTagCache = invalidateBookmarksTagCache;
export const invalidateBookmarkCache = (bookmarkId: string): void => {
  invalidateBookmarkCacheInternal(bookmarkId);
  logBookmarkDataAccessEvent("Cache invalidated for bookmark", { bookmarkId });
};

export async function getBookmarksIndex(): Promise<BookmarksIndex | null> {
  if (isProductionBuildPhase()) {
    return getCachedBookmarksIndex();
  }

  if (USE_NEXTJS_CACHE) {
    try {
      const cached = await getCachedBookmarksIndex();
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    return getBookmarksIndexDirect();
  }
  return getBookmarksIndexDirect();
}

// Cleanup cache and locks on process exit
process.on("SIGTERM", () => {
  releaseRefreshLock().catch((error) =>
    console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)),
  );
});
