/**
 * @file In-memory cache management for bookmarks
 * @module lib/bookmarks/cache-management.server
 *
 * Manages runtime caching of bookmark data to prevent repeated S3 reads.
 * These are temporary in-process caches, NOT S3 persistence.
 */

import type { UnifiedBookmark, LightweightBookmark } from "@/types/bookmark";
import { USE_NEXTJS_CACHE, cacheContextGuards } from "@/lib/cache";
import { envLogger } from "@/lib/utils/env-logger";
import { LOG_PREFIX } from "@/lib/bookmarks/config";

// ============================================================================
// Full Dataset Memory Cache
// ============================================================================

/**
 * Get the current full dataset cache if valid.
 * Memory cache removed; always returns null.
 */
export function getFullDatasetCache(): UnifiedBookmark[] | null {
  return null;
}

/**
 * Update the full dataset cache.
 * Memory cache removed; no-op.
 */
export function setFullDatasetCache(_bookmarks: UnifiedBookmark[]): void {
  envLogger.log("Skipped full dataset cache update (memory cache removed)", undefined, {
    category: LOG_PREFIX,
  });
}

/**
 * Clear the full dataset cache.
 */
export function clearFullDatasetCache(): void {
  envLogger.log("Skipped full dataset cache clear (memory cache removed)", undefined, {
    category: LOG_PREFIX,
  });
}

/**
 * Check if the full dataset cache is valid.
 * Memory cache removed; always returns false.
 */
export function isFullDatasetCacheValid(_bypassForTest: boolean = false): boolean {
  return false;
}

// ============================================================================
// Bookmark-by-ID Memory Cache
// ============================================================================

/**
 * Clear both bookmark-by-id caches.
 */
export function invalidateBookmarkByIdCaches(): void {
  // no-op: memory cache removed
}

/**
 * Get a cached bookmark by ID.
 * @param key - Bookmark ID
 * @param lightweight - Whether to get from the lightweight cache
 * @returns Cached bookmark or null if not found/stale
 */
export function getCachedBookmarkById(key: string, lightweight: true): LightweightBookmark | null;
export function getCachedBookmarkById(key: string, lightweight: false): UnifiedBookmark | null;
export function getCachedBookmarkById(
  key: string,
  lightweight: boolean,
): UnifiedBookmark | LightweightBookmark | null;
export function getCachedBookmarkById(
  _key: string,
  _lightweight: boolean,
): UnifiedBookmark | LightweightBookmark | null {
  return null;
}

/**
 * Cache a bookmark by ID.
 * @param key - Bookmark ID
 * @param value - Bookmark to cache
 * @param lightweight - Whether to store in the lightweight cache
 */
export function setCachedBookmarkById(
  key: string,
  value: LightweightBookmark,
  lightweight: true,
): void;
export function setCachedBookmarkById(
  key: string,
  value: UnifiedBookmark,
  lightweight: false,
): void;
export function setCachedBookmarkById(
  _key: string,
  _value: UnifiedBookmark | LightweightBookmark,
  _lightweight: boolean,
): void {
  // no-op: memory cache removed
}

/**
 * Remove a specific bookmark from both caches.
 * @param bookmarkId - ID of bookmark to remove
 */
export function invalidateBookmarkMemoryCache(bookmarkId: string): void {
  void bookmarkId;
}

// ============================================================================
// Next.js Cache Integration
// ============================================================================

/**
 * Safe wrapper for cacheLife that handles non-request contexts.
 */
export const safeCacheLife = (
  profile:
    | "default"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "max"
    | { stale?: number; revalidate?: number; expire?: number },
): void => {
  cacheContextGuards.cacheLife("BookmarksDataAccess", profile);
};

/**
 * Safe wrapper for cacheTag that handles non-request contexts.
 */
export const safeCacheTag = (...tags: string[]): void => {
  cacheContextGuards.cacheTag("BookmarksDataAccess", ...tags);
};

/**
 * Safe wrapper for revalidateTag that handles non-request contexts.
 */
export const safeRevalidateTag = (...tags: string[]): void => {
  cacheContextGuards.revalidateTag("BookmarksDataAccess", ...tags);
};

/**
 * Invalidate all bookmarks-related Next.js caches.
 */
export function invalidateNextJsBookmarksCache(): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("bookmarks");
    safeRevalidateTag("bookmarks-db-full");
    safeRevalidateTag("bookmarks-s3-full");
    envLogger.log("Next.js cache invalidated for bookmarks tags", undefined, {
      category: "Bookmarks",
    });
  }
}

/**
 * Invalidate a specific page's cache.
 * @param pageNumber - Page number to invalidate
 */
export function invalidatePageCache(pageNumber: number): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-page-${pageNumber}`);
  }
}

/**
 * Invalidate a specific tag's cache.
 * @param tagSlug - Tag slug to invalidate
 */
export function invalidateTagCache(tagSlug: string): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-tag-${tagSlug}`);
  }
}
