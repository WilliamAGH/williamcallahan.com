/**
 * @file Bookmark Slug Manager - S3-persisted URL-to-slug mappings
 *
 * Critical for stable bookmark URLs across deployments:
 * - Generates deterministic slugs from bookmark URLs
 * - Persists to S3 (primary) and local file (ephemeral cache)
 * - Ensures bookmarks maintain consistent URLs even after container restarts
 *
 * Architecture:
 * - S3 = Source of truth (survives deployments)
 * - Local file = Temporary cache (lost on container restart)
 *
 * @module lib/bookmarks/slug-manager
 */

import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import { normalizeString } from "@/lib/utils";
import type { UnifiedBookmark, BookmarkSlugMapping, BookmarkSlugEntry } from "@/types";
import { bookmarkSlugMappingSchema } from "@/types/bookmark";
import { readJsonS3, writeJsonS3, deleteFromS3 } from "@/lib/s3-utils";
import { readLocalS3JsonSafe, getLocalS3Path } from "@/lib/bookmarks/local-s3-cache";
import { isS3NotFound } from "@/lib/utils/s3-error-guards";
import { BOOKMARKS_S3_PATHS, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import logger from "@/lib/utils/logger";
import { envLogger } from "@/lib/utils/env-logger";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  shouldSkipLocalS3CacheForSlugManager as shouldSkipLocalS3Cache,
  isSlugManagerLoggingEnabled,
} from "@/lib/bookmarks/config";

// Local file path for ephemeral cache (container-local, not persisted)
export const LOCAL_SLUG_MAPPING_PATH = path.join(
  process.cwd(),
  "generated",
  "bookmarks",
  "slug-mapping.json",
);

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

const SLUG_SHARD_BATCH_SIZE = 50;
const SHARD_FALLBACK_CHAR = "_";

const normalizeShardChar = (char: string | undefined): string => {
  if (!char) return SHARD_FALLBACK_CHAR;
  const lower = char.toLowerCase();
  return /[a-z0-9]/.test(lower) ? lower : SHARD_FALLBACK_CHAR;
};

const getSlugShardBucket = (slug: string): string => {
  const normalized = normalizeString(slug);
  if (normalized.length === 0) {
    return `${SHARD_FALLBACK_CHAR}${SHARD_FALLBACK_CHAR}`;
  }
  const first = normalizeShardChar(normalized[0]);
  const second = normalizeShardChar(normalized[1]);
  return `${first}${second}`;
};

const encodeSlugForKey = (slug: string): string => encodeURIComponent(slug);

const getSlugShardKey = (slug: string): string =>
  `${BOOKMARKS_S3_PATHS.SLUG_SHARD_PREFIX}${getSlugShardBucket(slug)}/${encodeSlugForKey(slug)}.json`;

async function writeLocalSlugShard(key: string, entry: BookmarkSlugEntry): Promise<void> {
  if (shouldSkipLocalS3Cache) return;
  const filePath = getLocalS3Path(key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entry, null, 2));
}

async function deleteLocalSlugShard(key: string): Promise<void> {
  if (shouldSkipLocalS3Cache) return;
  const filePath = getLocalS3Path(key);
  await fs.rm(filePath, { force: true });
}

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
    // Pass bookmark title for content-sharing domains (YouTube, Reddit, etc.)
    let slug = generateUniqueSlug(
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
    generated: new Date().toISOString(),
    count: bookmarks.length,
    checksum,
    slugs,
    reverseMap,
  };
  return mapping;
}

const collectSlugs = (mapping: BookmarkSlugMapping | null): Set<string> => {
  const slugs = new Set<string>();
  if (!mapping) return slugs;
  if (mapping.reverseMap && Object.keys(mapping.reverseMap).length > 0) {
    for (const slug of Object.keys(mapping.reverseMap)) {
      slugs.add(slug);
    }
  } else {
    for (const entry of Object.values(mapping.slugs ?? {})) {
      if (entry?.slug) {
        slugs.add(entry.slug);
      }
    }
  }
  return slugs;
};

async function persistSlugShards(
  mapping: BookmarkSlugMapping,
  previous: BookmarkSlugMapping | null,
): Promise<void> {
  const entries = Object.values(mapping.slugs ?? {});
  const previousSlugs = collectSlugs(previous);
  const currentSlugs = new Set(entries.map((entry) => entry.slug));
  const staleSlugs: string[] = [];

  if (previousSlugs.size > 0) {
    for (const slug of previousSlugs) {
      if (!currentSlugs.has(slug)) {
        staleSlugs.push(slug);
      }
    }
  }

  if (entries.length > 0) {
    for (let index = 0; index < entries.length; index += SLUG_SHARD_BATCH_SIZE) {
      const batch = entries.slice(index, index + SLUG_SHARD_BATCH_SIZE);
      await Promise.all(
        batch.map(async (entry) => {
          const shardKey = getSlugShardKey(entry.slug);
          await writeJsonS3(shardKey, entry);
          try {
            await writeLocalSlugShard(shardKey, entry);
          } catch (error) {
            envLogger.debug(
              "Failed to persist local slug shard",
              { key: shardKey, error },
              { category: "SlugManager" },
            );
          }
        }),
      );
    }
    envLogger.log(
      "Persisted slug shards",
      { count: entries.length, checksum: mapping.checksum },
      { category: "SlugManager" },
    );
  }

  if (staleSlugs.length > 0) {
    for (let index = 0; index < staleSlugs.length; index += SLUG_SHARD_BATCH_SIZE) {
      const batch = staleSlugs.slice(index, index + SLUG_SHARD_BATCH_SIZE);
      await Promise.all(
        batch.map(async (slug) => {
          const shardKey = getSlugShardKey(slug);
          try {
            await deleteFromS3(shardKey);
          } catch (error) {
            if (!isS3NotFound(error)) {
              envLogger.debug(
                "Failed to delete stale slug shard",
                { key: shardKey, error },
                { category: "SlugManager" },
              );
            }
          }
          try {
            await deleteLocalSlugShard(shardKey);
          } catch (error) {
            envLogger.debug(
              "Failed to remove local stale slug shard",
              { key: shardKey, error },
              { category: "SlugManager" },
            );
          }
        }),
      );
    }
    envLogger.log(
      "Removed stale slug shards",
      { count: staleSlugs.length },
      { category: "SlugManager" },
    );
  }
}

export async function getSlugShard(slug: string): Promise<BookmarkSlugEntry | null> {
  const shardKey = getSlugShardKey(slug);
  try {
    const entry = await readJsonS3<BookmarkSlugEntry>(shardKey);
    if (entry?.slug === slug) {
      return entry;
    }
  } catch (error) {
    if (!isS3NotFound(error)) {
      envLogger.debug(
        "Failed to read slug shard from S3",
        { key: shardKey, error },
        { category: "SlugManager" },
      );
    }
  }

  const localEntry = await readLocalS3JsonSafe<BookmarkSlugEntry>(shardKey, shouldSkipLocalS3Cache);
  if (localEntry?.slug === slug) {
    return localEntry;
  }
  return null;
}

/**
 * Save slug mapping to S3 (primary) and local file (cache).
 *
 * CRITICAL OPERATION: Essential for bookmark navigation stability.
 * - S3 write ensures persistence across deployments
 * - Local file provides fast access during container lifetime
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
  saveToAllPaths = false,
): Promise<void> {
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logSlugEnvironmentOnce("save");
  logger.info(`[SlugManager] [CRITICAL] Preparing to save slug mapping to S3 path: ${primaryPath}`);

  try {
    const mapping = generateSlugMapping(bookmarks);
    logger.info(
      `[SlugManager] Generated mapping with ${mapping.count} entries, checksum: ${mapping.checksum}`,
    );

    let previousMapping: BookmarkSlugMapping | null = null;

    // Save to local file (ephemeral cache for container lifetime)
    await fs.mkdir(path.dirname(LOCAL_SLUG_MAPPING_PATH), { recursive: true });
    await fs.writeFile(LOCAL_SLUG_MAPPING_PATH, JSON.stringify(mapping, null, 2));
    logger.info(`[SlugManager] ✅ Saved to local cache (ephemeral): ${LOCAL_SLUG_MAPPING_PATH}`);

    // Save to S3 (primary persistent storage)
    // Checksum comparison prevents unnecessary writes and race conditions
    if (overwrite) {
      // For overwrites, check if the content has changed
      // to avoid unnecessary writes and potential race conditions
      try {
        previousMapping = await readJsonS3<BookmarkSlugMapping>(primaryPath);
        if (previousMapping && previousMapping.checksum === mapping.checksum) {
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
            envLogger.debug(`Saved to redundant path`, path, { category: "SlugManager" });
          } catch (error) {
            envLogger.debug(
              `Could not save to redundant path`,
              { path, error },
              { category: "SlugManager" },
            );
          }
        }
      }
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
 * Load slug mapping with fallback chain:
 * 1. Local file (fastest, ephemeral cache)
 * 2. Primary S3 path (environment-specific)
 * 3. Alternative S3 paths (cross-environment fallback)
 *
 * @returns Slug mapping or null if not found
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  // --- 1. Try loading from local cache first ---
  try {
    const localData = await fs.readFile(LOCAL_SLUG_MAPPING_PATH, "utf-8");
    const parsed: unknown = JSON.parse(localData);
    const validation = bookmarkSlugMappingSchema.safeParse(parsed);
    if (!validation.success) {
      logger.warn(`[SlugManager] Local cache failed validation: ${validation.error.message}`);
      throw new Error("Local cache validation failed");
    }
    const mapping = validation.data;

    // Skip local cache if it only contains test data
    const isTestData = mapping?.count === 1 && mapping?.slugs?.["test-1"]?.id === "test-1";
    // Skip local cache if it's empty (count is 0 or slugs is empty)
    const isEmpty =
      !mapping?.count ||
      mapping.count === 0 ||
      !mapping?.slugs ||
      Object.keys(mapping.slugs).length === 0;

    if (isTestData) {
      logger.info(`[SlugManager] Local cache contains only test data, skipping to S3`);
    } else if (isEmpty) {
      logger.info(
        `[SlugManager] Local cache is empty (count: ${mapping?.count || 0}), skipping to S3`,
      );
    } else if (mapping?.slugs) {
      logger.info(
        `[SlugManager] Successfully loaded slug mapping from local cache: ${LOCAL_SLUG_MAPPING_PATH}`,
      );
      return mapping;
    }
  } catch (error) {
    // This is not a critical error, just means we need to fetch from S3
    logger.warn(
      `[SlugManager] Local slug mapping cache not found or invalid, proceeding to S3. Error: ${String(error)}`,
    );
  }

  // --- 2. Fallback to S3 ---
  const primaryPath = BOOKMARKS_S3_PATHS.SLUG_MAPPING;
  logger.info(`[SlugManager] Attempting to load slug mapping from S3 path: ${primaryPath}`);
  logSlugEnvironmentOnce("load");

  try {
    // Try primary path first
    const data = await readJsonS3<BookmarkSlugMapping>(primaryPath);
    if (data) {
      logger.info(
        `[SlugManager] Successfully loaded slug mapping with ${data.count} entries from primary path`,
      );
      return data;
    }
    const localS3Data = await readLocalS3JsonSafe<BookmarkSlugMapping>(
      primaryPath,
      shouldSkipLocalS3Cache,
    );
    if (localS3Data) {
      logger.info(
        `[SlugManager] Loaded slug mapping from local cache mirror (${primaryPath}) with ${localS3Data.count} entries`,
      );
      return localS3Data;
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
        logger.warn(
          `[SlugManager] ⚠️ Loaded mapping from fallback path: ${fallbackPath} (expected: ${primaryPath})`,
        );
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
    logger.error("[SlugManager] Failed to load slug mapping");
    return null;
  }

  const bookmarkId = getBookmarkIdFromSlug(mapping, slug);
  if (!bookmarkId) {
    logger.warn(`[SlugManager] No bookmark found for slug: ${slug}`);
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
    logger.warn(`[SlugManager] Bookmark with ID ${bookmarkId} not found in bookmarks data`);
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
