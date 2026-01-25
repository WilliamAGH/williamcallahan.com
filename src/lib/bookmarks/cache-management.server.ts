/**
 * @file In-memory cache management for bookmarks
 * @module lib/bookmarks/cache-management.server
 *
 * Manages runtime caching of bookmark data to prevent repeated S3 reads.
 * These are temporary in-process caches, NOT S3 persistence.
 */

import type { UnifiedBookmark, LightweightBookmark } from "@/types/bookmark";
import { getDeterministicTimestamp } from "@/lib/server-cache";
import { USE_NEXTJS_CACHE, cacheContextGuards } from "@/lib/cache";
import { envLogger } from "@/lib/utils/env-logger";
import {
  FULL_DATASET_MEMORY_CACHE_TTL_MS,
  BOOKMARK_BY_ID_CACHE_TTL_MS,
  BOOKMARK_BY_ID_CACHE_LIMIT,
  LOG_PREFIX,
} from "@/lib/bookmarks/config";

// ============================================================================
// Full Dataset Memory Cache
// ============================================================================

/**
 * In-memory runtime cache for the full bookmarks dataset.
 * Used to prevent repeated S3 reads during the same process lifetime.
 */
let fullDatasetMemoryCache: { data: UnifiedBookmark[]; timestamp: number } | null = null;

/**
 * Get the current full dataset cache if valid.
 * @returns Cached bookmarks array or null if cache is stale/empty
 */
export function getFullDatasetCache(): UnifiedBookmark[] | null {
  if (!fullDatasetMemoryCache) return null;
  const now = getDeterministicTimestamp();
  if (now - fullDatasetMemoryCache.timestamp > FULL_DATASET_MEMORY_CACHE_TTL_MS) {
    fullDatasetMemoryCache = null;
    return null;
  }
  return fullDatasetMemoryCache.data;
}

/**
 * Update the full dataset cache.
 * @param bookmarks - The bookmarks to cache
 */
export function setFullDatasetCache(bookmarks: UnifiedBookmark[]): void {
  fullDatasetMemoryCache = {
    data: bookmarks,
    timestamp: getDeterministicTimestamp(),
  };
  envLogger.log("Updated in-memory runtime cache", { bookmarkCount: bookmarks.length }, { category: LOG_PREFIX });
}

/**
 * Clear the full dataset cache.
 */
export function clearFullDatasetCache(): void {
  fullDatasetMemoryCache = null;
  envLogger.log("In-memory runtime cache cleared", undefined, { category: LOG_PREFIX });
}

/**
 * Check if the full dataset cache is valid.
 * @param bypassForTest - Whether to bypass cache in test environment
 */
export function isFullDatasetCacheValid(bypassForTest: boolean = false): boolean {
  if (bypassForTest) return false;
  if (!fullDatasetMemoryCache) return false;
  const now = getDeterministicTimestamp();
  return now - fullDatasetMemoryCache.timestamp < FULL_DATASET_MEMORY_CACHE_TTL_MS;
}

// ============================================================================
// Bookmark-by-ID Memory Cache
// ============================================================================

const bookmarkByIdCache = new Map<string, { data: UnifiedBookmark | LightweightBookmark; timestamp: number }>();
const lightweightBookmarkByIdCache = new Map<
  string,
  { data: UnifiedBookmark | LightweightBookmark; timestamp: number }
>();

/**
 * Clear both bookmark-by-id caches.
 */
export function invalidateBookmarkByIdCaches(): void {
  bookmarkByIdCache.clear();
  lightweightBookmarkByIdCache.clear();
}

/**
 * Get a cached bookmark by ID.
 * @param key - Bookmark ID
 * @param lightweight - Whether to get from the lightweight cache
 * @returns Cached bookmark or null if not found/stale
 */
export function getCachedBookmarkById(key: string, lightweight: true): LightweightBookmark | null;
export function getCachedBookmarkById(key: string, lightweight: false): UnifiedBookmark | null;
export function getCachedBookmarkById(key: string, lightweight: boolean): UnifiedBookmark | LightweightBookmark | null;
export function getCachedBookmarkById(key: string, lightweight: boolean): UnifiedBookmark | LightweightBookmark | null {
  const cache = lightweight ? lightweightBookmarkByIdCache : bookmarkByIdCache;
  const entry = cache.get(key);
  if (!entry) return null;
  if (getDeterministicTimestamp() - entry.timestamp > BOOKMARK_BY_ID_CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Cache a bookmark by ID.
 * @param key - Bookmark ID
 * @param value - Bookmark to cache
 * @param lightweight - Whether to store in the lightweight cache
 */
export function setCachedBookmarkById(key: string, value: LightweightBookmark, lightweight: true): void;
export function setCachedBookmarkById(key: string, value: UnifiedBookmark, lightweight: false): void;
export function setCachedBookmarkById(
  key: string,
  value: UnifiedBookmark | LightweightBookmark,
  lightweight: boolean,
): void {
  const cache = lightweight ? lightweightBookmarkByIdCache : bookmarkByIdCache;
  cache.set(key, { data: value, timestamp: getDeterministicTimestamp() });
  if (cache.size > BOOKMARK_BY_ID_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

/**
 * Remove a specific bookmark from both caches.
 * @param bookmarkId - ID of bookmark to remove
 */
export function invalidateBookmarkMemoryCache(bookmarkId: string): void {
  bookmarkByIdCache.delete(bookmarkId);
  lightweightBookmarkByIdCache.delete(bookmarkId);
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
    safeRevalidateTag("bookmarks-s3-full");
    envLogger.log("Next.js cache invalidated for bookmarks tags", undefined, { category: "Bookmarks" });
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
