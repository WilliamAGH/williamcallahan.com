/**
 * Centralized slug helpers for bookmark URLs
 * 
 * These helpers ensure consistent slug usage across server and client components
 * by using pre-computed mappings instead of generating slugs on-the-fly.
 */

import { loadSlugMapping, generateSlugMapping, getSlugForBookmark } from "./slug-manager";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";

// Cache the slug mapping in memory for the request lifecycle
let cachedMapping: BookmarkSlugMapping | null = null;

/**
 * Get the slug for a bookmark, using pre-computed mappings for hydration safety
 * 
 * @param bookmarkId - The bookmark ID to get slug for
 * @param bookmarks - Optional array of all bookmarks (used to generate mapping if needed)
 * @returns The slug for the bookmark, or null if not found
 */
export async function getSafeBookmarkSlug(
  bookmarkId: string,
  bookmarks?: UnifiedBookmark[]
): Promise<string | null> {
  // Try to use cached mapping first
  if (cachedMapping) {
    return getSlugForBookmark(cachedMapping, bookmarkId);
  }
  
  // Load the mapping from S3
  let mapping = await loadSlugMapping();
  
  // If no mapping exists and bookmarks provided, generate it
  if (!mapping && bookmarks) {
    mapping = generateSlugMapping(bookmarks);
  }
  
  if (!mapping) {
    console.error(`[SlugHelpers] No slug mapping available for bookmark ${bookmarkId}`);
    return null;
  }
  
  // Cache for subsequent calls in this request
  cachedMapping = mapping;
  
  return getSlugForBookmark(mapping, bookmarkId);
}

/**
 * Get slugs for multiple bookmarks efficiently
 * 
 * @param bookmarks - Array of bookmarks to get slugs for
 * @returns Map of bookmark ID to slug
 */
export async function getBulkBookmarkSlugs(
  bookmarks: UnifiedBookmark[]
): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>();
  
  // Load or generate the mapping
  let mapping = await loadSlugMapping();
  if (!mapping) {
    mapping = generateSlugMapping(bookmarks);
  }
  
  // Cache for subsequent calls
  cachedMapping = mapping;
  
  // Build the map
  for (const bookmark of bookmarks) {
    const slug = getSlugForBookmark(mapping, bookmark.id);
    if (slug) {
      slugMap.set(bookmark.id, slug);
    }
  }
  
  return slugMap;
}

/**
 * Reset the cached mapping (useful for tests or when data updates)
 */
export function resetSlugCache(): void {
  cachedMapping = null;
}