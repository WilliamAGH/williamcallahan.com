/**
 * Centralized slug helpers for bookmark URLs
 *
 * These helpers ensure consistent slug usage across server and client components
 * by using pre-computed mappings instead of generating slugs on-the-fly.
 */

import { loadSlugMapping, generateSlugMapping, getSlugForBookmark, saveSlugMapping } from "./slug-manager";
import type { UnifiedBookmark } from "@/types";
import type { CachedSlugMapping } from "@/types/cache";
import logger from "@/lib/utils/logger";

// Cache the slug mapping with TTL for automatic invalidation
let cachedMapping: CachedSlugMapping | null = null;

// Import cache TTL from configuration
import { getSlugCacheTTL } from "@/config/related-content.config";

const CACHE_TTL_MS = getSlugCacheTTL();

/**
 * Get the slug for a bookmark, using pre-computed mappings for hydration safety
 *
 * @param bookmarkId - The bookmark ID to get slug for
 * @param bookmarks - Optional array of all bookmarks (used to generate mapping if needed)
 * @returns The slug for the bookmark, or null if not found
 */
export async function getSafeBookmarkSlug(bookmarkId: string, bookmarks?: UnifiedBookmark[]): Promise<string | null> {
  // Try to use cached mapping first (check TTL)
  if (cachedMapping) {
    const age = Date.now() - cachedMapping.timestamp;
    if (age < CACHE_TTL_MS) {
      return getSlugForBookmark(cachedMapping.data, bookmarkId);
    } else {
      // Cache expired, clear it
      cachedMapping = null;
    }
  }

  // Load the mapping from S3
  let mapping = await loadSlugMapping();

  // If no mapping exists and bookmarks provided, generate and save it
  if (!mapping && bookmarks) {
    mapping = generateSlugMapping(bookmarks);
    try {
      await saveSlugMapping(bookmarks);
    } catch (error) {
      // Log the error with critical level since this affects navigation
      logger.error("[CRITICAL] Failed to save slug mapping - bookmark navigation may fail", { 
        error,
        bookmarkId,
        bookmarkCount: bookmarks.length 
      });
      // Still return the generated mapping for this request, but don't cache it
      // since it wasn't persisted. This allows the current request to succeed.
      return getSlugForBookmark(mapping, bookmarkId);
    }
  }

  if (!mapping) {
    logger.error(`[SlugHelpers] No slug mapping available for bookmark ${bookmarkId}`);
    return null;
  }

  // Cache for subsequent calls with timestamp
  if (mapping) {
    cachedMapping = {
      data: mapping,
      timestamp: Date.now()
    };
  }

  return mapping ? getSlugForBookmark(mapping, bookmarkId) : null;
}

/**
 * Get slugs for multiple bookmarks efficiently
 *
 * @param bookmarks - Array of bookmarks to get slugs for
 * @returns Map of bookmark ID to slug
 */
export async function getBulkBookmarkSlugs(bookmarks: UnifiedBookmark[]): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>();

  // Check cache first (with TTL)
  if (cachedMapping) {
    const age = Date.now() - cachedMapping.timestamp;
    if (age < CACHE_TTL_MS) {
      // Use cached mapping
      for (const bookmark of bookmarks) {
        const slug = getSlugForBookmark(cachedMapping.data, bookmark.id);
        if (slug) {
          slugMap.set(bookmark.id, slug);
        }
      }
      return slugMap;
    } else {
      // Cache expired
      cachedMapping = null;
    }
  }

  // Load or generate the mapping
  let mapping = await loadSlugMapping();
  if (!mapping) {
    mapping = generateSlugMapping(bookmarks);
    try {
      await saveSlugMapping(bookmarks);
    } catch (error) {
      // Log critical error but don't fail the request
      logger.error("[CRITICAL] Failed to save bulk slug mapping - using in-memory mapping", { 
        error,
        bookmarkCount: bookmarks.length 
      });
      // Continue with the generated mapping even if save failed
    }
  }

  // Cache for subsequent calls with timestamp
  if (mapping) {
    cachedMapping = {
      data: mapping,
      timestamp: Date.now()
    };
  }

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
