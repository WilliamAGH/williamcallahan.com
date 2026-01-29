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
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";
import { stripImageData } from "./utils";

/**
 * Cached version of getBookmarks that ensures bookmarks are only fetched once per request
 * This prevents the N+1 query pattern when multiple components need bookmarks
 */
export const getCachedBookmarks = cache(
  async (options?: {
    skipExternalFetch?: boolean;
    includeImageData?: boolean;
  }): Promise<UnifiedBookmark[]> => {
    const bookmarks = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: options?.includeImageData ?? false,
      skipExternalFetch: options?.skipExternalFetch ?? false,
    })) as UnifiedBookmark[];

    if (options?.includeImageData) {
      return bookmarks;
    }

    return bookmarks.map(stripImageData);
  },
);

/**
 * Cached version of getBulkBookmarkSlugs that reuses cached bookmarks
 * This ensures we don't fetch bookmarks multiple times just to get slugs
 */
export const getCachedBookmarkSlugs = cache(async (): Promise<Map<string, string>> => {
  // Use the cached bookmarks to prevent duplicate fetches
  const bookmarks = await getCachedBookmarks({
    includeImageData: false,
    skipExternalFetch: false,
  });
  return await getBulkBookmarkSlugs(bookmarks);
});

// NOTE: Components should call getCachedBookmarks({ includeImageData: true }) explicitly when hydrated data is required.
