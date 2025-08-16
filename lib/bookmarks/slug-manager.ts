/**
 * Bookmark Slug Manager
 * 
 * Manages pre-computed bookmark slugs to avoid runtime computation
 * and ensure consistency across the application.
 */

import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import logger from "@/lib/utils/logger";

const SLUG_MAPPING_KEY = "bookmark-slugs.json";

/**
 * Generate slug mapping for all bookmarks
 */
export function generateSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: BookmarkSlugMapping['slugs'] = {};
  const reverseMap: BookmarkSlugMapping['reverseMap'] = {};
  
  // Sort bookmarks by ID for consistent ordering (string comparison)
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.id.localeCompare(b.id));
  
  for (const bookmark of sortedBookmarks) {
    const slug = generateUniqueSlug(
      bookmark.url,
      sortedBookmarks.map(b => ({ id: b.id, url: b.url })),
      bookmark.id
    );
    
    slugs[bookmark.id] = {
      id: bookmark.id,
      slug,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
    };
    
    reverseMap[slug] = bookmark.id;
  }
  
  return {
    version: "1.0.0",
    generated: new Date().toISOString(),
    count: bookmarks.length,
    slugs,
    reverseMap,
  };
}

/**
 * Save slug mapping to S3
 */
export async function saveSlugMapping(
  bookmarks: UnifiedBookmark[]
): Promise<void> {
  try {
    const mapping = generateSlugMapping(bookmarks);
    
    // Save to S3 with the standard utilities
    await writeJsonS3(`bookmarks/${SLUG_MAPPING_KEY}`, mapping);
    logger.info(`Saved bookmark slug mapping with ${mapping.count} entries to S3`);
  } catch (error) {
    logger.error("Failed to save slug mapping:", error);
    throw error;
  }
}

/**
 * Load slug mapping from S3 or cache
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  try {
    const data = await readJsonS3<BookmarkSlugMapping>(`bookmarks/${SLUG_MAPPING_KEY}`);
    return data;
  } catch (error) {
    logger.error("Failed to load slug mapping:", error);
    return null;
  }
}

/**
 * Get slug for a bookmark ID
 */
export function getSlugForBookmark(
  mapping: BookmarkSlugMapping,
  bookmarkId: string
): string | null {
  const entry = mapping.slugs[bookmarkId];
  return entry?.slug || null;
}

/**
 * Get bookmark ID from slug
 */
export function getBookmarkIdFromSlug(
  mapping: BookmarkSlugMapping,
  slug: string
): string | null {
  return mapping.reverseMap[slug] || null;
}

/**
 * Generate all bookmark routes for static generation
 */
export function generateBookmarkRoutes(mapping: BookmarkSlugMapping): string[] {
  return Object.values(mapping.slugs).map(entry => `/bookmarks/${entry.slug}`);
}