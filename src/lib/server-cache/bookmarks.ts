/**
 * @module lib/server-cache/bookmarks
 * @description Domain-specific cache methods for bookmarks.
 * These methods are intended to be attached to the ServerCache prototype.
 *
 * NOTE: Bookmarks are stored in S3, not in memory cache.
 * These methods now only track metadata about the last fetch.
 */

import type { BookmarksCacheEntry, Cache } from "@/types/cache";
import { BOOKMARKS_CACHE_DURATION } from "@/lib/constants";
import { getMonotonicTime } from "@/lib/utils";

const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

const BOOKMARKS_METADATA_KEY = "bookmarks:metadata";

/**
 * Check if bookmarks should be refreshed
 * This method checks the age of cached metadata
 */
export function shouldRefreshBookmarks(cache: Cache): boolean {
  const cached = cache.get<BookmarksCacheEntry>(BOOKMARKS_METADATA_KEY);
  if (!cached) {
    return true;
  }

  // Empty bookmarks should always trigger a refresh
  if (cached.bookmarks.length === 0) {
    return true;
  }

  const now = getCacheTimestamp();
  const timeSinceLastFetch = now - cached.lastFetchedAt;
  const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;

  return timeSinceLastFetch > revalidationThreshold;
}

export function clearBookmarks(cache: Cache): void {
  cache.del(BOOKMARKS_METADATA_KEY);
}
