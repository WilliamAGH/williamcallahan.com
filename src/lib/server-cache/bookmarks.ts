/**
 * @module lib/server-cache/bookmarks
 * @description Domain-specific cache methods for bookmarks.
 * These methods are intended to be attached to the ServerCache prototype.
 *
 * NOTE: Bookmarks are stored in S3, not in memory cache.
 * These methods now only track metadata about the last fetch.
 */

import type { BookmarksCacheEntry, ICache } from "@/types/cache";
import { BOOKMARKS_CACHE_DURATION } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { getMonotonicTime } from "@/lib/utils";

const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

const BOOKMARKS_METADATA_KEY = "bookmarks:metadata";

/**
 * Get bookmarks metadata (not the actual bookmarks)
 * For actual bookmarks, they should be loaded from S3
 *
 * @deprecated Use S3 index directly for metadata
 */
export function getBookmarks(this: ICache): BookmarksCacheEntry | undefined {
  // Only return cached metadata
  const cachedMetadata = this.get<BookmarksCacheEntry>(BOOKMARKS_METADATA_KEY);
  return cachedMetadata;
}

/**
 * This method is deprecated - bookmarks should not be stored in memory
 *
 * @deprecated Bookmarks are stored in S3, not in cache
 */
export function setBookmarks(this: ICache): void {
  // NO-OP: Bookmarks are stored in S3, not in memory cache
  if (process.env.NODE_ENV !== "test") {
    envLogger.log("setBookmarks called - this is deprecated. Bookmarks are stored in S3 only.", undefined, {
      category: "ServerCache",
      context: { method: "setBookmarks", deprecated: true },
    });
  }
}

/**
 * Check if bookmarks should be refreshed
 * This method checks the age of cached metadata
 */
export function shouldRefreshBookmarks(this: ICache): boolean {
  const cached = this.get<BookmarksCacheEntry>(BOOKMARKS_METADATA_KEY);
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

export function clearBookmarks(this: ICache): void {
  this.del(BOOKMARKS_METADATA_KEY);
}
