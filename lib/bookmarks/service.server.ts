/**
 * Unified Bookmarks Service - Single entry point for all bookmark operations
 */

import {
  getBookmarks as getBookmarksInternal,
  getBookmarksByTag as getBookmarksByTagInternal,
  getBookmarksIndex as getBookmarksIndexInternal,
  getBookmarksPage as getBookmarksPageInternal,
  getBookmarkById as getBookmarkByIdInternal,
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import type { UnifiedBookmark } from "@/types";
import type { BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { envLogger } from "@/lib/utils/env-logger";

const isBookmarkServiceLoggingEnabled =
  process.env.DEBUG_BOOKMARKS === "true" ||
  process.env.DEBUG_BOOKMARKS_SERVICE === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

// Initialize the refresh callback
setRefreshBookmarksCallback((force?: boolean) => refreshBookmarksData(force));

/**
 * Get bookmarks from cache or S3, with optional background refresh
 */
export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  initializeBookmarksDataAccess();
  const result = await getBookmarksInternal(options);

  if (isBookmarkServiceLoggingEnabled) {
    envLogger.log(
      "getBookmarks",
      {
        skipExternalFetch: options.skipExternalFetch ?? false,
        includeImageData: options.includeImageData ?? true,
        force: options.force ?? false,
        resultCount: result.length,
      },
      { category: "BookmarksService" },
    );
  }
  return result;
}

export async function getBookmarkById(
  bookmarkId: string,
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark | LightweightBookmark | null> {
  initializeBookmarksDataAccess();
  return getBookmarkByIdInternal(bookmarkId, options);
}

/**
 * Force refresh bookmarks from external API
 */
export async function refreshBookmarks(force = false): Promise<UnifiedBookmark[] | null> {
  return refreshAndPersistBookmarks(force);
}

/**
 * Get bookmarks by tag with transparent caching
 */
export async function getBookmarksByTag(tagSlug: string, pageNumber: number = 1) {
  initializeBookmarksDataAccess();
  return getBookmarksByTagInternal(tagSlug, pageNumber);
}

/**
 * Get a single page of bookmarks from cache or S3
 */
export async function getBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  initializeBookmarksDataAccess();
  return getBookmarksPageInternal(pageNumber);
}

/**
 * Get the main bookmarks index from cache or S3
 */
export async function getBookmarksIndex() {
  initializeBookmarksDataAccess();
  return getBookmarksIndexInternal();
}
