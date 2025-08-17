/**
 * Bookmark Slug Manager
 *
 * Manages pre-computed bookmark slugs to avoid runtime computation
 * and ensure consistency across the application.
 */

import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import logger from "@/lib/utils/logger";

/**
 * Generate slug mapping for all bookmarks
 */
export function generateSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: Record<string, { id: string; slug: string; url: string; title: string }> = {};
  const reverseMap: Record<string, string> = {};

  // Sort bookmarks by ID for consistent ordering (string comparison)
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.id.localeCompare(b.id));

  for (const bookmark of sortedBookmarks) {
    const slug = generateUniqueSlug(
      bookmark.url,
      sortedBookmarks.map((b) => ({ id: b.id, url: b.url })),
      bookmark.id,
    );

    slugs[bookmark.id] = {
      id: bookmark.id,
      slug,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
    };

    reverseMap[slug] = bookmark.id;
  }

  const mapping: BookmarkSlugMapping = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    count: bookmarks.length,
    slugs,
    reverseMap,
  };
  return mapping;
}

/**
 * Save slug mapping to S3
 * @param bookmarks - Array of bookmarks to generate mapping from
 * @param overwrite - Whether to overwrite existing mapping (default: true)
 * @param saveToAllPaths - Whether to save to all environment paths for redundancy (default: false)
 */
export async function saveSlugMapping(bookmarks: UnifiedBookmark[], overwrite = true, saveToAllPaths = false): Promise<void> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logger.info(`[SlugManager] Environment check: NODE_ENV=${process.env.NODE_ENV || '(not set)'}`);
  logger.info(`[SlugManager] Preparing to save slug mapping to S3 path: ${primaryPath}`);
  
  try {
    const mapping = generateSlugMapping(bookmarks);
    logger.info(`[SlugManager] Generated mapping with ${mapping.count} entries`);

    // Save to primary path
    if (overwrite) {
      await writeJsonS3(primaryPath, mapping);
    } else {
      await writeJsonS3(primaryPath, mapping, { IfNoneMatch: "*" });
    }
    logger.info(`[SlugManager] ✅ Successfully saved to primary path: ${primaryPath}`);

    // Optionally save to all environment paths for redundancy
    if (saveToAllPaths) {
      const allPaths = [
        'json/bookmarks/slug-mapping.json',      // production
        'json/bookmarks/slug-mapping-dev.json',  // development
        'json/bookmarks/slug-mapping-test.json', // test
      ];

      for (const path of allPaths) {
        if (path !== primaryPath) {
          try {
            await writeJsonS3(path, mapping);
            logger.info(`[SlugManager] ✅ Also saved to ${path} for redundancy`);
          } catch (error) {
            logger.warn(`[SlugManager] Could not save to redundant path ${path}:`, error);
          }
        }
      }
    }
  } catch (error) {
    logger.error(`[SlugManager] Failed to save slug mapping:`, error);
    throw error;
  }
}

/**
 * Load slug mapping from S3 with fallback to other environment paths
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logger.info(`[SlugManager] Attempting to load slug mapping from S3 path: ${primaryPath}`);
  logger.info(`[SlugManager] Environment: NODE_ENV=${process.env.NODE_ENV || '(not set)'}`);
  
  try {
    // Try primary path first
    const data = await readJsonS3<BookmarkSlugMapping>(primaryPath);
    if (data) {
      logger.info(`[SlugManager] Successfully loaded slug mapping with ${data.count} entries from primary path`);
      return data;
    }
    logger.warn(`[SlugManager] No mapping at primary path: ${primaryPath}`);
  } catch (error) {
    logger.warn(`[SlugManager] Failed to load from primary path ${primaryPath}:`, error);
  }

  // Fallback: Try all possible environment paths
  const fallbackPaths = [
    'json/bookmarks/slug-mapping.json',      // production
    'json/bookmarks/slug-mapping-dev.json',  // development
    'json/bookmarks/slug-mapping-test.json', // test
  ].filter(path => path !== primaryPath);

  for (const fallbackPath of fallbackPaths) {
    try {
      logger.info(`[SlugManager] Trying fallback path: ${fallbackPath}`);
      const data = await readJsonS3<BookmarkSlugMapping>(fallbackPath);
      if (data) {
        logger.warn(`[SlugManager] ⚠️ Loaded mapping from fallback path: ${fallbackPath} (expected: ${primaryPath})`);
        logger.info(`[SlugManager] Consider running data-updater to sync paths`);
        return data;
      }
    } catch {
      // Continue to next fallback  
      logger.debug(`[SlugManager] Fallback path ${fallbackPath} not available`);
    }
  }

  logger.error(`[SlugManager] Failed to load slug mapping from any path`);
  return null;
}

/**
 * Get slug for a bookmark ID
 */
export function getSlugForBookmark(mapping: BookmarkSlugMapping, bookmarkId: string): string | null {
  const entry = mapping.slugs[bookmarkId];
  return entry?.slug || null;
}

/**
 * Get bookmark ID from slug
 */
export function getBookmarkIdFromSlug(mapping: BookmarkSlugMapping, slug: string): string | null {
  return mapping.reverseMap[slug] || null;
}

/**
 * Generate all bookmark routes for static generation
 */
export function generateBookmarkRoutes(mapping: BookmarkSlugMapping): string[] {
  return Object.values(mapping.slugs).map((entry) => `/bookmarks/${entry.slug}`);
}
