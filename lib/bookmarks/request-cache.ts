/**
 * Request-scoped cache for bookmarks to prevent N+1 queries
 * 
 * This cache uses React's cache() function to ensure bookmarks are only
 * fetched once per request, even when multiple components need them.
 * 
 * @module bookmarks/request-cache
 */

import { cache } from "react";
import { getBookmarks } from "./service.server";
import { getBulkBookmarkSlugs } from "./slug-helpers";
import type { UnifiedBookmark } from "@/types";

/**
 * Cached version of getBookmarks that ensures bookmarks are only fetched once per request
 * This prevents the N+1 query pattern when multiple components need bookmarks
 */
export const getCachedBookmarks = cache(async (options?: {
  skipExternalFetch?: boolean;
  includeImageData?: boolean;
}): Promise<UnifiedBookmark[]> => {
  return await getBookmarks(options) as UnifiedBookmark[];
});

/**
 * Cached version of getBulkBookmarkSlugs that reuses cached bookmarks
 * This ensures we don't fetch bookmarks multiple times just to get slugs
 */
export const getCachedBookmarkSlugs = cache(async (): Promise<Map<string, string>> => {
  // Use the cached bookmarks to prevent duplicate fetches
  const bookmarks = await getCachedBookmarks({ includeImageData: false });
  return await getBulkBookmarkSlugs(bookmarks);
});

/**
 * Get both bookmarks and their slug mappings efficiently
 * This is the preferred method when you need both data sets
 */
export const getCachedBookmarksWithSlugs = cache(async (): Promise<{
  bookmarks: UnifiedBookmark[];
  slugMap: Map<string, string>;
}> => {
  // Fetch bookmarks once
  const bookmarks = await getCachedBookmarks({ includeImageData: false });
  // Generate slug map from the same bookmarks
  const slugMap = await getBulkBookmarkSlugs(bookmarks);
  
  return { bookmarks, slugMap };
});