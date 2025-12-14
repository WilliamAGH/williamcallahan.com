/**
 * Search Cache Invalidation
 *
 * Functions for invalidating search caches.
 *
 * @module lib/search/cache-invalidation
 */

import { cacheContextGuards, USE_NEXTJS_CACHE } from "@/lib/cache";

/**
 * Type-safe wrapper for cache tag revalidation.
 */
const safeRevalidateTag = (...tags: string[]): void => {
  cacheContextGuards.revalidateTag("Search", ...tags);
};

/**
 * Invalidate all search caches.
 */
export function invalidateSearchCache(): void {
  if (USE_NEXTJS_CACHE) {
    // Invalidate all search cache tags
    safeRevalidateTag("search");
    safeRevalidateTag("posts-search");
    console.log("[Search] Cache invalidated for all search results");
  }
}

/**
 * Invalidate search cache for a specific query.
 *
 * @param query - The search query to invalidate
 */
export function invalidateSearchQueryCache(query: string): void {
  if (USE_NEXTJS_CACHE) {
    const truncatedQuery = query.slice(0, 20);
    safeRevalidateTag(`search-posts-${truncatedQuery}`);
    console.log(`[Search] Cache invalidated for query: ${truncatedQuery}`);
  }
}
