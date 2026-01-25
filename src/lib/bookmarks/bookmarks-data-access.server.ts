/** Bookmarks data access: In-memory → S3 → External API */

import { readJsonS3, listS3Objects } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import type { UnifiedBookmark } from "@/types";
import {
  bookmarksIndexSchema as BookmarksIndexSchema,
  type BookmarksIndex,
  type BookmarkLoadOptions,
  type LightweightBookmark,
} from "@/types/bookmark";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { normalizeBookmarkTags, stripImageData, normalizePageBookmarkTags } from "@/lib/bookmarks/utils";
import {
  isBookmarkServiceLoggingEnabled,
  shouldSkipLocalS3Cache,
  LOG_PREFIX,
  BOOKMARK_SERVICE_LOG_CATEGORY,
} from "@/lib/bookmarks/config";
import { getEnvironment } from "@/lib/config/environment";
import { USE_NEXTJS_CACHE, isCliLikeCacheContext, withCacheFallback } from "@/lib/cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { readLocalS3JsonSafe } from "@/lib/bookmarks/local-s3-cache";
import { isS3NotFound } from "@/lib/utils/s3-error-guards";

const LOCAL_BOOKMARKS_PATH = path.join(process.cwd(), "generated", "bookmarks", "bookmarks.json");
const LOCAL_BOOKMARKS_BY_ID_DIR = path.join(process.cwd(), ".next", "cache", "bookmarks", "by-id");

const loadLocalBookmarksSnapshot = async (): Promise<UnifiedBookmark[] | null> => {
  try {
    const localData = await fs.readFile(LOCAL_BOOKMARKS_PATH, "utf-8");
    const bookmarks = JSON.parse(localData) as UnifiedBookmark[];
    if (!Array.isArray(bookmarks) || bookmarks.length === 0) {
      return null;
    }
    if (bookmarks.length === 1) {
      const [onlyBookmark] = bookmarks;
      if (
        onlyBookmark &&
        (onlyBookmark.id === "test-1" || onlyBookmark.id === "test" || onlyBookmark.url === "https://example.com")
      ) {
        console.warn(
          "[Bookmarks] Local bookmarks snapshot contains only test data; ignoring local fallback at",
          LOCAL_BOOKMARKS_PATH,
        );
        return null;
      }
    }
    return bookmarks;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Bookmarks] Local bookmarks cache unavailable (${message}).`);
    return null;
  }
};

// Runtime-safe cache wrappers imported from cache-management
import {
  safeCacheLife,
  safeCacheTag,
  getCachedBookmarkById,
  setCachedBookmarkById,
  getFullDatasetCache,
  setFullDatasetCache,
  clearFullDatasetCache,
  invalidateNextJsBookmarksCache,
  invalidatePageCache,
  invalidateTagCache as invalidateTagCacheInternal,
  invalidateBookmarkCache as invalidateBookmarkCacheInternal,
} from "@/lib/bookmarks/cache-management.server";

const isCliLikeContext = isCliLikeCacheContext;

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;

// Cache logic moved to cache-management.server.ts

import { refreshAndPersistBookmarks, releaseRefreshLock } from "@/lib/bookmarks/refresh-logic.server";

export {
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
  cleanupBookmarksDataAccess,
  refreshAndPersistBookmarks,
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
  logBookmarkDataAccessEvent("fetchAndCacheBookmarks", { skipExternalFetch, includeImageData, force });

  // --- 1. Prefer S3 in production runtime; use local fallback only in dev/test/CLI contexts ---
  const isProductionRuntime =
    getEnvironment() === "production" && !isCliLikeContext() && process.env.NEXT_PHASE !== "phase-production-build";
  const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
  let localBookmarksSnapshot: UnifiedBookmark[] | null = null;
  if (!isProductionRuntime && !isTestEnvironment) {
    localBookmarksSnapshot = await loadLocalBookmarksSnapshot();
    if (localBookmarksSnapshot) {
      logBookmarkDataAccessEvent("Loaded bookmarks from local cache", {
        bookmarkCount: localBookmarksSnapshot.length,
        path: LOCAL_BOOKMARKS_PATH,
      });
      if (!includeImageData) {
        logBookmarkDataAccessEvent("Stripping image data from local cache bookmarks", {
          bookmarkCount: localBookmarksSnapshot.length,
        });
        return localBookmarksSnapshot.map(stripImageData);
      }
      return localBookmarksSnapshot.map(normalizeBookmarkTags);
    }
  } else if (isProductionRuntime) {
    // Explicitly log that we are skipping local fallback in production runtime to avoid stale snapshots from build layers
    envLogger.log("Skipping local bookmarks fallback in production runtime; using S3-first strategy", undefined, {
      category: LOG_PREFIX,
    });
  }

  // --- 2. Fallback to S3 (with local snapshot) ---
  const formatBookmarks = (dataset: UnifiedBookmark[], source: string) => {
    if (!includeImageData) {
      logBookmarkDataAccessEvent(`Stripping image data from ${source} bookmarks`, {
        bookmarkCount: dataset.length,
      });
      return dataset.map(stripImageData);
    }
    return dataset.map(normalizeBookmarkTags);
  };

  let bookmarksFromS3: UnifiedBookmark[] | null = null;
  try {
    const s3Data = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (s3Data && Array.isArray(s3Data) && s3Data.length > 0) {
      bookmarksFromS3 = s3Data;
    }
  } catch (e: unknown) {
    if (!isS3NotFound(e)) {
      console.error(`${LOG_PREFIX} Error reading bookmarks file:`, String(e));
    }
  }

  if (bookmarksFromS3) {
    logBookmarkDataAccessEvent("Loaded bookmarks from S3", { bookmarkCount: bookmarksFromS3.length });
    if (process.env.DEBUG_BOOKMARKS === "true") {
      const cliBookmark = bookmarksFromS3.find(b => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
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

  if (!localBookmarksSnapshot) {
    localBookmarksSnapshot = await loadLocalBookmarksSnapshot();
  }
  if (localBookmarksSnapshot) {
    logBookmarkDataAccessEvent("Loaded bookmarks from local cache (post-S3 failure)", {
      bookmarkCount: localBookmarksSnapshot.length,
      path: LOCAL_BOOKMARKS_PATH,
    });
    return formatBookmarks(localBookmarksSnapshot, "local fallback");
  }

  const localS3Snapshot = await readLocalS3JsonSafe<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE, shouldSkipLocalS3Cache);
  if (localS3Snapshot && Array.isArray(localS3Snapshot) && localS3Snapshot.length > 0) {
    logBookmarkDataAccessEvent("Loaded bookmarks from local S3 snapshot", {
      bookmarkCount: localS3Snapshot.length,
      source: "local",
    });
    return formatBookmarks(localS3Snapshot, "local S3 snapshot");
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
  const key = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(key);
    if (pageData) {
      return normalizePageBookmarkTags(pageData);
    }
  } catch (error) {
    if (!isS3NotFound(error)) {
      console.error(`${LOG_PREFIX} S3 service error loading page ${pageNumber}:`, error);
    }
  }

  const fallback = await readLocalS3JsonSafe<UnifiedBookmark[]>(key, shouldSkipLocalS3Cache);
  if (fallback) {
    logBookmarkDataAccessEvent("Loaded page data from local S3 mirror", { pageNumber, source: "local" });
    return normalizePageBookmarkTags(fallback);
  }

  return [];
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
  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedBookmarksPage(pageNumber),
        () => getBookmarksPageDirect(pageNumber),
      )
    : getBookmarksPageDirect(pageNumber);
}

async function getTagBookmarksPageDirect(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  const key = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(key);
    if (pageData) {
      return normalizePageBookmarkTags(pageData);
    }
  } catch (error) {
    if (!isS3NotFound(error)) {
      console.error(`${LOG_PREFIX} S3 service error loading tag page ${tagSlug}/${pageNumber}:`, error);
    }
  }

  const fallback = await readLocalS3JsonSafe<UnifiedBookmark[]>(key, shouldSkipLocalS3Cache);
  if (fallback) {
    logBookmarkDataAccessEvent("Loaded tag page data from local S3 mirror", {
      pageNumber,
      tagSlug,
      source: "local",
    });
    return normalizePageBookmarkTags(fallback);
  }

  return [];
}

/**
 * Gets bookmarks for a specific tag with caching.
 * Cache duration: 1 hour (aligned with main cache for consistency).
 * @param tagSlug - URL-safe tag identifier
 * @param pageNumber - Page number within tag results
 * @returns Bookmarks matching the tag
 */
async function getCachedTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - aligned with main bookmark cache
  safeCacheTag("bookmarks", `bookmarks-tag-${tagSlug}`, `bookmarks-tag-${tagSlug}-page-${pageNumber}`);
  return getTagBookmarksPageDirect(tagSlug, pageNumber);
}

export async function getTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedTagBookmarksPage(tagSlug, pageNumber),
        () => getTagBookmarksPageDirect(tagSlug, pageNumber),
      )
    : getTagBookmarksPageDirect(tagSlug, pageNumber);
}

async function getTagBookmarksIndexDirect(tagSlug: string): Promise<BookmarksIndex | null> {
  try {
    return await readJsonS3<BookmarksIndex>(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`);
  } catch (error) {
    if (isS3NotFound(error)) return null;
    console.error(`${LOG_PREFIX} S3 service error loading tag index ${tagSlug}:`, error);
    return null;
  }
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
  const prefix = BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX;
  const keys = await listS3Objects(prefix);
  if (keys.length === 0) {
    return [];
  }

  const slugs = new Set<string>();
  for (const key of keys) {
    const normalized = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    const match = normalized.match(/^([^/]+)\/index\.json$/);
    if (match && match[1]) {
      slugs.add(match[1]);
    }
  }

  return Array.from(slugs).toSorted();
}

async function getBookmarksIndexDirect(): Promise<BookmarksIndex | null> {
  try {
    const rawIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
    const validation = BookmarksIndexSchema.safeParse(rawIndex);
    if (validation.success) return validation.data;
    console.warn(`${LOG_PREFIX} Main bookmarks index failed validation`, validation.error);
    return null;
  } catch (error) {
    if (isS3NotFound(error)) return null;
    console.error(`${LOG_PREFIX} S3 service error loading main bookmarks index:`, error);
    return null;
  }
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

export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  if (inFlightGetPromise) return inFlightGetPromise;
  inFlightGetPromise = fetchAndCacheBookmarks(options);
  try {
    return await inFlightGetPromise;
  } catch (e) {
    console.error(`${LOG_PREFIX} Failed to get bookmarks:`, String(e));
    return [];
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
  const cached = getCachedBookmarkById<UnifiedBookmark | LightweightBookmark>(bookmarkId, !includeImageData);
  if (cached) {
    return cached;
  }

  const localFilePath = path.join(LOCAL_BOOKMARKS_BY_ID_DIR, `${bookmarkId}.json`);
  let bookmark: UnifiedBookmark | null = null;

  try {
    const localData = await fs.readFile(localFilePath, "utf-8");
    bookmark = JSON.parse(localData) as UnifiedBookmark;
  } catch {
    // Ignore local cache misses
  }

  if (!bookmark) {
    bookmark = await readJsonS3<UnifiedBookmark>(`${BOOKMARKS_S3_PATHS.BY_ID_DIR}/${bookmarkId}.json`);
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
    bookmark = allBookmarks.find(b => b.id === bookmarkId) ?? null;
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
): Promise<{ bookmarks: UnifiedBookmark[]; totalCount: number; totalPages: number; fromCache: boolean }> {
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
  logBookmarkDataAccessEvent("Tag page cache miss, filtering full dataset", { tagSlug, pageNumber });

  // Check in-memory runtime cache first to avoid repeated S3 reads.
  // In test environment, bypass the in-process cache so each test can
  // provide different mocked datasets deterministically.
  let allBookmarks: UnifiedBookmark[];
  const bypassMemoryCache = process.env.NODE_ENV === "test";

  const cachedDataset = !bypassMemoryCache ? getFullDatasetCache() : null;

  if (cachedDataset) {
    // Note: getFullDatasetCache handles TTL internally
    envLogger.log("Using in-memory runtime cache for full bookmarks dataset", undefined, { category: LOG_PREFIX });
    allBookmarks = cachedDataset;
  } else {
    envLogger.log("Reading full bookmarks dataset from S3 persistence", undefined, { category: LOG_PREFIX });
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
  const filteredBookmarks = allBookmarks.filter(b => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some(t => {
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
  // Clear in-memory runtime cache
  clearFullDatasetCache();
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
  releaseRefreshLock().catch(error => console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)));
});
