/** Bookmarks data access: Next.js cache tags → PostgreSQL → External API */

import { BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import type { UnifiedBookmark, BookmarksIndex } from "@/types/schemas/bookmark";
import type { BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
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
import {
  safeCacheLife,
  safeCacheTag,
  invalidateNextJsBookmarksCache,
  invalidatePageCache,
  invalidateTagCache as invalidateTagCacheInternal,
} from "@/lib/bookmarks/cache-management.server";
import {
  refreshAndPersistBookmarks,
  releaseRefreshLock,
} from "@/lib/bookmarks/refresh-logic.server";

const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

let bookmarkQueryModulePromise: Promise<typeof import("@/lib/db/queries/bookmarks")> | null = null;

const loadBookmarkQueryModule = (): Promise<typeof import("@/lib/db/queries/bookmarks")> =>
  (bookmarkQueryModulePromise ??= import("@/lib/db/queries/bookmarks"));

/** Cached full bookmarks dataset. */
export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour
  safeCacheTag("bookmarks-db-full");
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  logBookmarkDataAccessEvent("getBookmarks", {
    skipExternalFetch,
    includeImageData,
    force,
  });

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

async function getBookmarksPageDirect(
  tagSlug: string | null,
  pageNumber: number,
  pageSize: number,
): Promise<UnifiedBookmark[]> {
  const queryModule = await loadBookmarkQueryModule();
  const pageData =
    tagSlug === null
      ? await queryModule.getBookmarksPage(pageNumber, pageSize)
      : await queryModule.getBookmarksPageByTag(tagSlug, pageNumber, pageSize);
  return normalizePageBookmarkTags(pageData);
}

async function getCachedBookmarksPage(
  tagSlug: string | null,
  pageNumber: number,
  pageSize: number,
): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 86400 });
  safeCacheTag(
    "bookmarks",
    tagSlug === null ? `bookmarks-page-${pageNumber}` : `bookmarks-tag-${tagSlug}`,
    tagSlug === null
      ? `bookmarks-page-${pageNumber}-sz-${pageSize}`
      : `bookmarks-tag-${tagSlug}-page-${pageNumber}-sz-${pageSize}`,
  );
  return getBookmarksPageDirect(tagSlug, pageNumber, pageSize);
}

async function getBookmarksPageWithCache(
  tagSlug: string | null,
  pageNumber: number,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<UnifiedBookmark[]> {
  if (isProductionBuildPhase()) return getCachedBookmarksPage(tagSlug, pageNumber, pageSize);

  if (!USE_NEXTJS_CACHE) return getBookmarksPageDirect(tagSlug, pageNumber, pageSize);

  if (tagSlug === null) {
    return withCacheFallback(
      () => getCachedBookmarksPage(tagSlug, pageNumber, pageSize),
      () => getBookmarksPageDirect(tagSlug, pageNumber, pageSize),
    );
  }

  try {
    const cached = await getCachedBookmarksPage(tagSlug, pageNumber, pageSize);
    if (cached) return cached;
  } catch (error) {
    console.warn("[Bookmarks] Cached tag page fetch failed, falling back to direct", error);
  }
  return getBookmarksPageDirect(tagSlug, pageNumber, pageSize);
}

export async function getBookmarksPage(
  pageNumber: number,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<UnifiedBookmark[]> {
  return getBookmarksPageWithCache(null, pageNumber, pageSize);
}

export async function getTagBookmarksPage(
  tagSlug: string,
  pageNumber: number,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<UnifiedBookmark[]> {
  return getBookmarksPageWithCache(tagSlug, pageNumber, pageSize);
}

async function getBookmarksIndexDirect(
  tagSlug: string | null,
  pageSize: number,
): Promise<BookmarksIndex | null> {
  const queryModule = await loadBookmarkQueryModule();
  return tagSlug === null
    ? queryModule.getBookmarksIndexFromDatabase(pageSize)
    : queryModule.getTagBookmarksIndexFromDatabase(tagSlug, pageSize);
}

async function getCachedBookmarksIndex(
  tagSlug: string | null,
  pageSize: number,
): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife({ revalidate: 3600 });
  if (tagSlug === null) {
    safeCacheTag("bookmarks", `bookmarks-index-sz-${pageSize}`);
  } else {
    safeCacheTag(
      "bookmarks",
      `bookmarks-tag-${tagSlug}`,
      `bookmarks-tag-${tagSlug}-index-sz-${pageSize}`,
    );
  }
  return getBookmarksIndexDirect(tagSlug, pageSize);
}

async function getBookmarksIndexWithCache(
  tagSlug: string | null,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<BookmarksIndex | null> {
  if (isProductionBuildPhase()) return getCachedBookmarksIndex(tagSlug, pageSize);

  if (USE_NEXTJS_CACHE) {
    try {
      const cached = await getCachedBookmarksIndex(tagSlug, pageSize);
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
  }
  return getBookmarksIndexDirect(tagSlug, pageSize);
}

export async function getBookmarksIndex(
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<BookmarksIndex | null> {
  return getBookmarksIndexWithCache(null, pageSize);
}

export async function getTagBookmarksIndex(
  tagSlug: string,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<BookmarksIndex | null> {
  return getBookmarksIndexWithCache(tagSlug, pageSize);
}

export async function listTagSlugs(): Promise<string[]> {
  if (isProductionBuildPhase()) return listTagSlugsCached();
  const { listTagSlugsFromDatabase } = await loadBookmarkQueryModule();
  return listTagSlugsFromDatabase();
}

export async function listCanonicalTagPageCounts(
  pageSize?: number,
): Promise<Array<{ tagSlug: string; totalPages: number }>> {
  const { listCanonicalTagPageCountsFromDatabase } = await loadBookmarkQueryModule();
  return listCanonicalTagPageCountsFromDatabase(pageSize);
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

export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
  pageSize: number = BOOKMARKS_PER_PAGE,
): Promise<{
  bookmarks: UnifiedBookmark[];
  totalCount: number;
  totalPages: number;
  fromCache: boolean;
}> {
  logBookmarkDataAccessEvent("getBookmarksByTag invoked", { tagSlug, pageNumber, pageSize });
  const [index, pageBookmarks] = await Promise.all([
    getTagBookmarksIndex(tagSlug, pageSize),
    getTagBookmarksPage(tagSlug, pageNumber, pageSize),
  ]);

  if (!index || index.count === 0) {
    return { bookmarks: [], totalCount: 0, totalPages: 0, fromCache: true };
  }

  logBookmarkDataAccessEvent("Served tag page from PostgreSQL query", {
    tagSlug,
    pageNumber,
    pageSize,
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

process.on("SIGTERM", () => {
  releaseRefreshLock().catch((error) =>
    console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)),
  );
});
