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
import { createHash } from "node:crypto";
import { promises as fs } from "fs";
import path from "path";

const LOCAL_SLUG_MAPPING_PATH = path.join(process.cwd(), "lib", "data", "slug-mapping.json");

/**
 * Generate slug mapping for all bookmarks
 */
export function generateSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: Record<string, { id: string; slug: string; url: string; title: string }> = {};
  const reverseMap: Record<string, string> = {};

  // Sort bookmarks by ID for consistent ordering (string comparison)
  const sortedBookmarks = [...bookmarks].sort((a, b) => a.id.localeCompare(b.id));

  for (const bookmark of sortedBookmarks) {
    // generateUniqueSlug should handle uniqueness, but add a belt-and-suspenders guard
    const candidates = sortedBookmarks.map((b) => ({ id: b.id, url: b.url })).filter((c) => !!c.url);
    let slug = generateUniqueSlug(bookmark.url || "", candidates as { id: string; url: string }[], bookmark.id);

    // Validate that a slug was generated
    if (!slug) {
      throw new Error(
        `[SlugManager] CRITICAL: Failed to generate slug for bookmark ${bookmark.id}. ` +
          `URL: ${bookmark.url}, Title: ${bookmark.title}`,
      );
    }

    // Collision safety: ensure reverseMap doesn't already own this slug
    if (reverseMap[slug] && reverseMap[slug] !== bookmark.id) {
      slug = `${slug}-${bookmark.id.slice(0, 8)}`;
    }

    slugs[bookmark.id] = {
      id: bookmark.id,
      slug,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
    };

    reverseMap[slug] = bookmark.id;
  }

  // Validate that every bookmark has a slug
  const missingSlugIds = bookmarks.filter((b) => !slugs[b.id]).map((b) => b.id);
  if (missingSlugIds.length > 0) {
    throw new Error(
      `[SlugManager] CRITICAL: ${missingSlugIds.length} bookmarks missing slugs: ${missingSlugIds.join(", ")}`,
    );
  }

  // Generate checksum for change detection based on [id, slug] pairs in a stable order
  const checksumPayload = Object.keys(slugs)
    .sort((a, b) => a.localeCompare(b))
    .map((id) => [id, slugs[id]?.slug]);
  const checksum = createHash("md5").update(JSON.stringify(checksumPayload)).digest("hex");

  const mapping: BookmarkSlugMapping = {
    version: "1.0.0",
    generated: new Date().toISOString(),
    count: bookmarks.length,
    checksum,
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
 *
 * CRITICAL OPERATION: This function is marked as critical and will execute even under memory pressure.
 * Slug mappings are essential for bookmark navigation and must always be saved.
 */
export async function saveSlugMapping(
  bookmarks: UnifiedBookmark[],
  overwrite = true,
  saveToAllPaths = false,
): Promise<void> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logger.info(`[SlugManager] [CRITICAL] Environment check: NODE_ENV=${process.env.NODE_ENV || "(not set)"}`);
  logger.info(`[SlugManager] [CRITICAL] Preparing to save slug mapping to S3 path: ${primaryPath}`);

  try {
    const mapping = generateSlugMapping(bookmarks);
    logger.info(`[SlugManager] Generated mapping with ${mapping.count} entries, checksum: ${mapping.checksum}`);

    // Ensure the directory exists
    await fs.mkdir(path.dirname(LOCAL_SLUG_MAPPING_PATH), { recursive: true });
    // Save to local file system for build-time/runtime fallback
    await fs.writeFile(LOCAL_SLUG_MAPPING_PATH, JSON.stringify(mapping, null, 2));
    logger.info(`[SlugManager] ✅ Successfully saved to local fallback path: ${LOCAL_SLUG_MAPPING_PATH}`);

    // Save to primary path with concurrent write protection
    // Use conditional writes to prevent concurrent overwrites
    if (overwrite) {
      // For overwrites, check if the content has changed
      // to avoid unnecessary writes and potential race conditions
      try {
        const existing = await readJsonS3<BookmarkSlugMapping>(primaryPath);
        if (existing && existing.checksum === mapping.checksum) {
          logger.info(`[SlugManager] Slug mapping unchanged (same checksum), skipping write`);
          return;
        }
      } catch {
        // File doesn't exist or read failed, proceed with write
      }
      await writeJsonS3(primaryPath, mapping);
    } else {
      // Use conditional write to prevent concurrent creation
      await writeJsonS3(primaryPath, mapping, { IfNoneMatch: "*" });
    }
    logger.info(`[SlugManager] ✅ Successfully saved to primary path: ${primaryPath}`);

    // Cache invalidation after successful save
    // This is critical to prevent stale slug mappings from being served
    try {
      const { revalidateTag } = await import("next/cache");
      // Invalidate all bookmark-related caches
      revalidateTag("bookmarks");
      revalidateTag("bookmarks-slugs");
      revalidateTag("search-index");
      logger.info(`[SlugManager] ✅ Cache invalidated for bookmark-related tags`);
    } catch (cacheError) {
      // Cache invalidation failure is non-fatal but should be logged
      logger.warn(`[SlugManager] Cache invalidation failed (non-fatal):`, cacheError);
    }

    // Optionally save to all environment paths for redundancy
    if (saveToAllPaths) {
      // Use programmatic path generation to avoid hardcoding
      const basePath = "json/bookmarks/slug-mapping";
      const envSuffixes = ["", "-dev", "-test"] as const;
      const allPaths = envSuffixes.map((suffix) => `${basePath}${suffix}.json`);

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
    // CRITICAL ERROR: Slug mapping failures are critical and must be propagated
    logger.error(`[SlugManager] [CRITICAL ERROR] Failed to save slug mapping:`, error);
    logger.error(`[SlugManager] [CRITICAL] This is a critical failure that will prevent bookmark navigation`);

    // Emit critical error metrics if available
    if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
      // Mark this as a critical system failure for monitoring
      console.error("CRITICAL_SYSTEM_ERROR: SLUG_MAPPING_SAVE_FAILED", {
        error: error instanceof Error ? error.message : String(error),
        path: primaryPath,
        bookmarkCount: bookmarks.length,
      });
    }

    throw error;
  }
}

/**
 * Load slug mapping from S3 with fallback to other environment paths
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  // --- 1. Try loading from local cache first ---
  try {
    const localData = await fs.readFile(LOCAL_SLUG_MAPPING_PATH, "utf-8");
    const mapping = JSON.parse(localData) as BookmarkSlugMapping;
    if (mapping && mapping.slugs) {
      logger.info(`[SlugManager] Successfully loaded slug mapping from local cache: ${LOCAL_SLUG_MAPPING_PATH}`);
      return mapping;
    }
  } catch (error) {
    // This is not a critical error, just means we need to fetch from S3
    logger.warn(`[SlugManager] Local slug mapping cache not found or invalid, proceeding to S3. Error: ${error}`);
  }

  // --- 2. Fallback to S3 ---
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logger.info(`[SlugManager] Attempting to load slug mapping from S3 path: ${primaryPath}`);
  logger.info(`[SlugManager] Environment: NODE_ENV=${process.env.NODE_ENV || "(not set)"}`);

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

  // Fallback: Try all possible environment paths using consistent suffix generation
  // Import the environment configuration to ensure consistency
  const { ensureEnvironmentPath } = await import("@/lib/config/environment");

  // Generate paths for all environments using the same logic as constants.ts
  const basePath = "json/bookmarks/slug-mapping";
  const fallbackPaths = [
    `${basePath}.json`, // production (no suffix)
    `${basePath}-dev.json`, // development
    `${basePath}-test.json`, // test
    // Also try the dynamically generated path in case it differs
    ensureEnvironmentPath(`${basePath}.json`),
  ].filter(
    (path, index, arr) =>
      // Remove duplicates and exclude the primary path
      path !== primaryPath && arr.indexOf(path) === index,
  );

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
 * Routes are sorted alphabetically for deterministic output
 */
export function generateBookmarkRoutes(mapping: BookmarkSlugMapping): string[] {
  return Object.values(mapping.slugs)
    .map((entry) => entry.slug)
    .sort((a, b) => a.localeCompare(b))
    .map((slug) => `/bookmarks/${slug}`);
}
