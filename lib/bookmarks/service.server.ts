/**
 * Unified Bookmarks Service - Single entry point for all bookmark operations
 */

import {
  getBookmarks as getBookmarksInternal,
  getBookmarksByTag as getBookmarksByTagInternal,
  getBookmarksIndex as getBookmarksIndexInternal,
  getBookmarksPage as getBookmarksPageInternal,
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import type { UnifiedBookmark } from "@/types";
import type { BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { envLogger } from "@/lib/utils/env-logger";

// Initialize the refresh callback
setRefreshBookmarksCallback((force?: boolean) => refreshBookmarksData(force));

/**
 * Get bookmarks from cache or S3, with optional background refresh
 */
export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  envLogger.service(
    "BookmarksService",
    "getBookmarks",
    {
      skipExternalFetch: options.skipExternalFetch,
      includeImageData: options.includeImageData,
      force: options.force,
    }
  );
  initializeBookmarksDataAccess();
  const result = await getBookmarksInternal(options);
  envLogger.service("BookmarksService", "getBookmarks", undefined, result.length);
  return result;
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
