/**
 * Unified Bookmarks Service - Single entry point for all bookmark operations
 */

import {
  getBookmarks as getBookmarksInternal,
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import type { UnifiedBookmark } from "@/types";

// Initialize the refresh callback
setRefreshBookmarksCallback(refreshBookmarksData);

/**
 * Get bookmarks from cache or S3, with optional background refresh
 */
export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  initializeBookmarksDataAccess();
  return getBookmarksInternal(skipExternalFetch);
}

/**
 * Force refresh bookmarks from external API
 */
export async function refreshBookmarks(): Promise<UnifiedBookmark[] | null> {
  return refreshAndPersistBookmarks();
}
