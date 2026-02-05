/**
 * @file Bookmark Slug Manager - S3-persisted URL-to-slug mappings
 *
 * Critical for stable bookmark URLs across deployments:
 * - Generates deterministic slugs from bookmark URLs
 * - Persists to S3 (primary source of truth)
 * - Ensures bookmarks maintain consistent URLs across deployments
 *
 * Architecture:
 * - S3 = Source of truth (survives deployments)
 *
 * @module lib/bookmarks/slug-manager
 */

import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark, BookmarkSlugMapping } from "@/types";
import { bookmarkSlugMappingSchema } from "@/types/bookmark";
import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { BOOKMARKS_S3_PATHS, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import logger from "@/lib/utils/logger";
import { envLogger } from "@/lib/utils/env-logger";
import { createHash } from "node:crypto";
import { isSlugManagerLoggingEnabled } from "@/lib/bookmarks/config";
import { persistSlugShards } from "@/lib/bookmarks/slug-shards";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";

const formatSlugEnvironmentSnapshot = (): string =>
  `NODE_ENV=${process.env.NODE_ENV || "(not set)"}, DEPLOYMENT_ENV=${process.env.DEPLOYMENT_ENV || "(not set)"}`;

let hasLoggedSlugEnvironmentInfo = false;

const logSlugEnvironmentOnce = (context: string): void => {
  if (!isSlugManagerLoggingEnabled || hasLoggedSlugEnvironmentInfo) return;
  hasLoggedSlugEnvironmentInfo = true;
  logger.info(
    `[SlugManager] Environment snapshot (${context}): ${formatSlugEnvironmentSnapshot()}`,
  );
};

/**
 * Generate deterministic slug mapping for all bookmarks.
 * Ensures every bookmark gets a unique, stable slug for routing.
 *
 * @param bookmarks - Array of normalized bookmarks
 * @returns Mapping with slugs, reverse lookup, and checksum
 * @throws Error if any bookmark cannot generate a slug
 */
export function generateSlugMapping(bookmarks: UnifiedBookmark[]): BookmarkSlugMapping {
  const slugs: Record<string, { id: string; slug: string; url: string; title: string }> = {};
  const reverseMap: Record<string, string> = {};

  // Sort bookmarks by ID for consistent ordering (string comparison)
  const sortedBookmarks = bookmarks.toSorted((a, b) => a.id.localeCompare(b.id));

  // Build candidates array once (performance optimization: avoids O(n²) array rebuilding)
  const candidates = sortedBookmarks
    .map((b) => ({ id: b.id, url: b.url, title: b.title }))
    .filter((c) => typeof c.url === "string" && c.url.length > 0);

  for (const bookmark of sortedBookmarks) {
    const existingSlug =
      typeof bookmark.slug === "string" && bookmark.slug.trim().length > 0 ? bookmark.slug : null;

    // Pass bookmark title for content-sharing domains (YouTube, Reddit, etc.)
    let slug =
      existingSlug ??
      generateUniqueSlug(
        bookmark.url || "",
        candidates,
        bookmark.id,
        bookmark.title, // ✅ Pass title for content-sharing domain slug generation
      );

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
    .toSorted((a, b) => a.localeCompare(b))
    .map((id) => [id, slugs[id]?.slug]);
  const checksum = createHash("md5").update(JSON.stringify(checksumPayload)).digest("hex");

  const mapping: BookmarkSlugMapping = {
    version: "1.0.0",
    generated: new Date(getDeterministicTimestamp()).toISOString(),
    count: bookmarks.length,
    checksum,
    slugs,
    reverseMap,
  };
  return mapping;
}

/**
 * Save slug mapping to S3 (primary).
 *
 * CRITICAL OPERATION: Essential for bookmark navigation stability.
 * - S3 write ensures persistence across deployments
 * - Checksum comparison prevents unnecessary S3 writes
 *
 * @param bookmarks - Array of bookmarks to generate mapping from
 * @param overwrite - Whether to overwrite existing mapping (default: true)
 * @param saveToAllPaths - Save to all env paths for redundancy (default: false)
 * @throws Error on S3 write failure (critical for bookmark routing)
 */
export async function saveSlugMapping(
  bookmarks: UnifiedBookmark[],
  overwrite = true,
): Promise<void> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logSlugEnvironmentOnce("save");
  if (isSlugManagerLoggingEnabled) {
    logger.info(`[SlugManager] Preparing to save slug mapping to S3 path: ${primaryPath}`);
  }

  try {
    const mapping = generateSlugMapping(bookmarks);
    if (isSlugManagerLoggingEnabled) {
      logger.info(
        `[SlugManager] Generated mapping with ${mapping.count} entries, checksum: ${mapping.checksum}`,
      );
    }

    let previousMapping: BookmarkSlugMapping | null = null;

    // Save to S3 (primary persistent storage)
    // Checksum comparison prevents unnecessary writes and race conditions
    if (overwrite) {
      // For overwrites, check if the content has changed
      // to avoid unnecessary writes and potential race conditions
      previousMapping = await readJsonS3Optional<BookmarkSlugMapping>(
        primaryPath,
        bookmarkSlugMappingSchema,
      );
      if (previousMapping && previousMapping.checksum === mapping.checksum) {
        if (isSlugManagerLoggingEnabled) {
          logger.info(`[SlugManager] Slug mapping unchanged (same checksum), skipping write`);
        }
        return;
      }
      await writeJsonS3(primaryPath, mapping);
    } else {
      // Use conditional write to prevent concurrent creation
      await writeJsonS3(primaryPath, mapping, { ifNoneMatch: "*" });
    }
    if (isSlugManagerLoggingEnabled) {
      logger.info(`[SlugManager] ✅ Successfully saved to primary path: ${primaryPath}`);
    }

    await persistSlugShards(mapping, previousMapping);

    // Cache invalidation after successful save
    // This is critical to prevent stale slug mappings from being served
    try {
      const { revalidateTag } = await import("next/cache");
      // Invalidate all bookmark-related caches
      revalidateTag("bookmarks", "max");
      revalidateTag("bookmarks-slugs", "max");
      revalidateTag("search-index", "max");
      envLogger.log(`Cache invalidated for bookmark tags`, undefined, { category: "SlugManager" });
    } catch (cacheError) {
      // Cache invalidation failure is non-fatal but should be logged
      envLogger.debug(`Cache invalidation failed (non-fatal)`, cacheError, {
        category: "SlugManager",
      });
    }
  } catch (error) {
    // CRITICAL ERROR: Slug mapping failures are critical and must be propagated
    logger.error(`[SlugManager] [CRITICAL ERROR] Failed to save slug mapping:`, error);
    logger.error(
      `[SlugManager] [CRITICAL] This is a critical failure that will prevent bookmark navigation`,
    );

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
 * Load slug mapping from the primary S3 path.
 *
 * @returns Slug mapping if found, null if not found or on error
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  if (isSlugManagerLoggingEnabled) {
    logger.info(`[SlugManager] Attempting to load slug mapping from S3 path: ${primaryPath}`);
  }
  logSlugEnvironmentOnce("load");

  try {
    const data = await readJsonS3Optional<BookmarkSlugMapping>(
      primaryPath,
      bookmarkSlugMappingSchema,
    );

    if (data) {
      if (isSlugManagerLoggingEnabled) {
        logger.info(
          `[SlugManager] Successfully loaded slug mapping with ${data.count} entries from primary path`,
        );
      }
      return data;
    }

    // File not found is a normal condition (e.g., first deployment) - not an error
    if (isSlugManagerLoggingEnabled) {
      logger.info(`[SlugManager] No slug mapping exists yet at: ${primaryPath}`);
    }
    return null;
  } catch (error) {
    // Actual S3 errors (network, permissions, etc.) are logged as errors
    if (isSlugManagerLoggingEnabled) {
      logger.error(`[SlugManager] Failed to load slug mapping from ${primaryPath}:`, error);
    }
    return null;
  }
}

/**
 * Get slug for a bookmark ID
 */
export function getSlugForBookmark(
  mapping: BookmarkSlugMapping,
  bookmarkId: string,
): string | null {
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
 * Get a bookmark by its slug
 * Returns the bookmark data if found, null otherwise
 */
export async function getBookmarkBySlug(slug: string): Promise<UnifiedBookmark | null> {
  const mapping = await loadSlugMapping();
  if (!mapping) {
    if (isSlugManagerLoggingEnabled) {
      logger.error("[SlugManager] Failed to load slug mapping");
    }
    return null;
  }

  const bookmarkId = getBookmarkIdFromSlug(mapping, slug);
  if (!bookmarkId) {
    if (isSlugManagerLoggingEnabled) {
      logger.warn(`[SlugManager] No bookmark found for slug: ${slug}`);
    }
    return null;
  }

  // Import here to avoid circular dependency
  const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
  const bookmarks = await getBookmarks({
    ...DEFAULT_BOOKMARK_OPTIONS,
    includeImageData: true,
    skipExternalFetch: true,
    force: false,
  });

  const bookmark = bookmarks.find((b) => b.id === bookmarkId);
  if (!bookmark) {
    if (isSlugManagerLoggingEnabled) {
      logger.warn(`[SlugManager] Bookmark with ID ${bookmarkId} not found in bookmarks data`);
    }
    return null;
  }

  return bookmark;
}

/**
 * Generate all bookmark routes for static generation
 * Routes are sorted alphabetically for deterministic output
 */
export function generateBookmarkRoutes(mapping: BookmarkSlugMapping): string[] {
  return Object.values(mapping.slugs)
    .map((entry) => entry.slug)
    .toSorted((a, b) => a.localeCompare(b))
    .map((slug) => `/bookmarks/${slug}`);
}
