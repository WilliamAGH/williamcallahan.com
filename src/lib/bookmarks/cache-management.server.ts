/**
 * @file Bookmark cache helpers
 * @module lib/bookmarks/cache-management.server
 *
 * Runtime-safe wrappers around Next.js cache primitives for bookmarks.
 */

import { USE_NEXTJS_CACHE, cacheContextGuards } from "@/lib/cache";
import { envLogger } from "@/lib/utils/env-logger";

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
 * Invalidate a specific page's cache across all page sizes.
 * @param pageNumber - Page number to invalidate
 */
export function invalidatePageCache(pageNumber: number): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-page-${pageNumber}`);
  }
}

/**
 * Invalidate a specific tag's cache (all pages and page sizes).
 * @param tagSlug - Tag slug to invalidate
 */
export function invalidateTagCache(tagSlug: string): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-tag-${tagSlug}`);
  }
}
