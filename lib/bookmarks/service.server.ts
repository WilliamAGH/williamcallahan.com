/**
 * Unified Bookmarks Service - Single entry point for all bookmark operations
 */

import {
  getBookmarks as getBookmarksInternal,
  getBookmarksByTag as getBookmarksByTagInternal,
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import type { UnifiedBookmark } from "@/types";
import type { BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";

// Initialize the refresh callback
setRefreshBookmarksCallback(refreshBookmarksData);

/**
 * Get bookmarks from cache or S3, with optional background refresh
 */
export async function getBookmarks(options: BookmarkLoadOptions = {}): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  initializeBookmarksDataAccess();
  return getBookmarksInternal(options);
}

/**
 * Force refresh bookmarks from external API
 */
export async function refreshBookmarks(): Promise<UnifiedBookmark[] | null> {
  return refreshAndPersistBookmarks();
}

/**
 * Get bookmarks by tag with transparent caching
 */
export async function getBookmarksByTag(tagSlug: string, pageNumber: number = 1) {
  initializeBookmarksDataAccess();
  return getBookmarksByTagInternal(tagSlug, pageNumber);
}
