/** Bookmarks data access: Next.js cache tags → PostgreSQL → External API */

import { BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import {
  type UnifiedBookmark,
  type BookmarksIndex,
  type BookmarkLoadOptions,
  type LightweightBookmark,
} from "@/types/bookmark";
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
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";

// Runtime-safe cache wrappers imported from cache-management
import {
  safeCacheLife,
  safeCacheTag,
  invalidateNextJsBookmarksCache,
  invalidatePageCache,
  invalidateTagCache as invalidateTagCacheInternal,
} from "@/lib/bookmarks/cache-management.server";

const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

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

let bookmarkQueryModulePromise: Promise<typeof import("@/lib/db/queries/bookmarks")> | null = null;

const loadBookmarkQueryModule = async (): Promise<typeof import("@/lib/db/queries/bookmarks")> => {
  bookmarkQueryModulePromise ??= import("@/lib/db/queries/bookmarks");
  return bookmarkQueryModulePromise;
};

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
  safeCacheTag("bookmarks-db-full");
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  logBookmarkDataAccessEvent("fetchAndCacheBookmarks", {
    skipExternalFetch,
    includeImageData,
    force,
  });

  // --- 1. Read from PostgreSQL ---
  const formatBookmarks = (dataset: UnifiedBookmark[], source: string) => {
    if (!includeImageData) {
      logBookmarkDataAccessEvent(`Stripping image data from ${source} bookmarks`, {
        bookmarkCount: dataset.length,
      });
      return dataset.map(stripImageData);
    }
    return dataset.map(normalizeBookmarkTags);
  };

  const { getAllBookmarks } = await loadBookmarkQueryModule();
  const bookmarksFromDatabase = await getAllBookmarks();

  if (bookmarksFromDatabase.length > 0) {
    logBookmarkDataAccessEvent("Loaded bookmarks from PostgreSQL", {
      bookmarkCount: bookmarksFromDatabase.length,
    });
    if (process.env.DEBUG_BOOKMARKS === "true") {
      const cliBookmark = bookmarksFromDatabase.find(
        (bookmark) => bookmark.id === "yz7g8v8vzprsd2bm1w1cjc4y",
      );
      if (cliBookmark) {
        logBookmarkDataAccessEvent("CLI bookmark content exists", {
          hasContent: !!cliBookmark.content,
          hasScreenshotAssetId: !!cliBookmark.content?.screenshotAssetId,
          screenshotAssetId: cliBookmark.content?.screenshotAssetId,
          contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
        });
      }
    }
    return formatBookmarks(bookmarksFromDatabase, "PostgreSQL");
  }

  logBookmarkDataAccessEvent("No bookmarks in PostgreSQL; attempting refresh");
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
  const { getBookmarksPage } = await loadBookmarkQueryModule();
  const pageData = await getBookmarksPage(pageNumber, BOOKMARKS_PER_PAGE);
  return normalizePageBookmarkTags(pageData);
}

/**
 * Gets a paginated bookmarks page with caching.
 * Cache duration: 1 day (pages rarely change, reduces DB reads).
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
  const { getBookmarksPageByTag } = await loadBookmarkQueryModule();
  const pageData = await getBookmarksPageByTag(tagSlug, pageNumber, BOOKMARKS_PER_PAGE);
  return normalizePageBookmarkTags(pageData);
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
  const { getTagBookmarksIndexFromDatabase } = await loadBookmarkQueryModule();
  return getTagBookmarksIndexFromDatabase(tagSlug, BOOKMARKS_PER_PAGE);
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
  const { listTagSlugsFromDatabase } = await loadBookmarkQueryModule();
  return listTagSlugsFromDatabase();
}

export async function resolveBookmarkTagSlug(tagSlug: string): Promise<{
  requestedSlug: string;
  canonicalSlug: string;
  canonicalTagName: string | null;
  isAlias: boolean;
}> {
  const { resolveCanonicalTagSlug } = await loadBookmarkQueryModule();
  return resolveCanonicalTagSlug(tagSlug);
}

async function listTagSlugsCached(): Promise<string[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 });
  safeCacheTag("bookmarks", "bookmarks-tag-slugs");
  const { listTagSlugsFromDatabase } = await loadBookmarkQueryModule();
  return listTagSlugsFromDatabase();
}

async function getBookmarksIndexDirect(): Promise<BookmarksIndex | null> {
  const { getBookmarksIndexFromDatabase } = await loadBookmarkQueryModule();
  return getBookmarksIndexFromDatabase(BOOKMARKS_PER_PAGE);
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
 * empty results (no bookmarks) and failures (service errors).
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

  let bookmark: UnifiedBookmark | null = null;

  const { getBookmarkById: getBookmarkByIdFromDatabase } = await loadBookmarkQueryModule();
  bookmark ??= await getBookmarkByIdFromDatabase(bookmarkId);

  if (!bookmark) {
    envLogger.log(
      "Bookmark missing from direct PostgreSQL lookup. Falling back to full dataset scan.",
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
    return bookmark;
  }

  return stripImageData(bookmark);
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
  const [index, pageBookmarks] = await Promise.all([
    getTagBookmarksIndex(tagSlug),
    getTagBookmarksPage(tagSlug, pageNumber),
  ]);

  if (!index || index.count === 0) {
    return { bookmarks: [], totalCount: 0, totalPages: 0, fromCache: true };
  }

  logBookmarkDataAccessEvent("Served tag page from PostgreSQL query", {
    tagSlug,
    pageNumber,
    count: pageBookmarks.length,
    totalCount: index.count,
  });

  return {
    bookmarks: pageBookmarks,
    totalCount: index.count,
    totalPages: index.totalPages,
    fromCache: true,
  };
}

/** Cache invalidation functions */
export const invalidateBookmarksCache = (): void => {
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
