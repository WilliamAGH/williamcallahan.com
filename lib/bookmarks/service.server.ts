/**
 * Unified Bookmarks Service
 *
 * Single entry point for all bookmark operations.
 * Consolidates fetching, caching, and refresh logic.
 *
 * @module lib/bookmarks/service
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import {
  getBookmarks as getBookmarksFromDataAccess,
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import type { UnifiedBookmark, FetchBookmarksOptions } from "@/types";

// Initialize the refresh callback to avoid circular dependency
setRefreshBookmarksCallback(refreshBookmarksData);

/**
 * Unified function to fetch bookmarks with consistent behavior across all call sites
 *
 * @param options - Configuration for how to fetch bookmarks
 * @returns Promise resolving to array of bookmarks
 */
export async function fetchBookmarks(options: FetchBookmarksOptions = {}): Promise<UnifiedBookmark[]> {
  const { mode = "stale-while-revalidate", skipExternalFetch = false } = options;

  // Ensure data access is initialized
  initializeBookmarksDataAccess();

  // For immediate mode or skipExternalFetch, delegate to data access layer
  if (mode === "immediate" || skipExternalFetch) {
    return getBookmarksFromDataAccess(skipExternalFetch);
  }

  // Stale-while-revalidate mode
  const cached = ServerCacheInstance.getBookmarks();
  const shouldRefresh = ServerCacheInstance.shouldRefreshBookmarks();

  // If we have valid cached data
  if (cached?.bookmarks?.length) {
    // Return cached data immediately
    const bookmarks = [...cached.bookmarks]; // Return copy to prevent mutations

    // Trigger background refresh if needed
    if (shouldRefresh && !skipExternalFetch) {
      console.log("[Bookmarks Service] Returning cached data, refreshing in background");

      // Fire and forget background refresh
      refreshAndPersistBookmarks().catch((error) => {
        console.error("[Bookmarks Service] Background refresh failed:", error);
      });
    }

    return bookmarks;
  }

  // No cached data - must fetch immediately
  console.log("[Bookmarks Service] No cache available, fetching fresh data");
  return getBookmarksFromDataAccess(skipExternalFetch);
}

/**
 * Force a refresh of bookmarks data from external API
 * Use this when you need to ensure fresh data regardless of cache state
 *
 * @returns Promise resolving to refreshed bookmarks or null if refresh failed
 */
export async function refreshBookmarks(): Promise<UnifiedBookmark[] | null> {
  return refreshAndPersistBookmarks();
}
