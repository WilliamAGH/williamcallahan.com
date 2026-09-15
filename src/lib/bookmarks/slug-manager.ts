/**
 * @file Bookmark Slug Manager - PostgreSQL-backed URL-to-slug mappings
 *
 * Critical for stable bookmark URLs across deployments:
 * - Generates deterministic slugs from bookmark URLs
 * - Reads canonical mappings from PostgreSQL bookmarks table
 * - Ensures bookmarks maintain consistent URLs across deployments
 *
 * @module lib/bookmarks/slug-manager
 */

import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import {
  getBookmarkBySlugFromDatabase,
  getSlugMappingRowsFromDatabase,
} from "@/lib/db/queries/bookmarks";
import type {
  UnifiedBookmark,
  BookmarkSlugMapping,
  BookmarkSlugSource,
} from "@/types/schemas/bookmark";
import { bookmarkSlugMappingSchema } from "@/types/schemas/bookmark";
import logger from "@/lib/utils/logger";
import { envLogger } from "@/lib/utils/env-logger";
import { createHash } from "node:crypto";
import { isSlugManagerLoggingEnabled } from "@/lib/bookmarks/config";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";
import { buildBookmarkPath } from "./bookmark-helpers";

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

export type PersistedBookmarkSlug = Pick<UnifiedBookmark, "id" | "slug">;

function reservePersistedSlugs(persistedSlugs: readonly PersistedBookmarkSlug[]): {
  persistedById: Map<string, string>;
  slugOwners: Map<string, string>;
} {
  const persistedById = new Map<string, string>();
  const slugOwners = new Map<string, string>();

  for (const { id, slug } of persistedSlugs) {
    if (slug.trim().length === 0) {
      throw new Error(`[SlugManager] Persisted bookmark ${id} has an empty slug.`);
    }

    const priorSlug = persistedById.get(id);
    if (priorSlug !== undefined && priorSlug !== slug) {
      throw new Error(`[SlugManager] Persisted bookmark ${id} has conflicting slug ownership.`);
    }

    const priorOwner = slugOwners.get(slug);
    if (priorOwner !== undefined && priorOwner !== id) {
      throw new Error(
        `[SlugManager] Persisted slug ${slug} is owned by both ${priorOwner} and ${id}.`,
      );
    }

    persistedById.set(id, slug);
    slugOwners.set(slug, id);
  }

  return { persistedById, slugOwners };
}

function allocateAvailableSlug(
  candidate: string,
  bookmarkId: string,
  slugOwners: ReadonlyMap<string, string>,
): string {
  const candidateOwner = slugOwners.get(candidate);
  if (candidateOwner === undefined || candidateOwner === bookmarkId) {
    return candidate;
  }

  const idSuffix = bookmarkId.slice(0, 8);
  let suffix = 1;
  let slug = `${candidate}-${idSuffix}`;
  while (slugOwners.has(slug) && slugOwners.get(slug) !== bookmarkId) {
    suffix += 1;
    slug = `${candidate}-${idSuffix}-${suffix}`;
  }
  return slug;
}

function buildSlugMapping(
  bookmarks: readonly BookmarkSlugSource[],
  persistedSlugs: readonly PersistedBookmarkSlug[],
): BookmarkSlugMapping {
  const slugs: Record<string, { id: string; slug: string; url: string; title: string }> = {};
  const reverseMap: Record<string, string> = {};
  const { persistedById, slugOwners } = reservePersistedSlugs(persistedSlugs);
  const seenBookmarkIds = new Set<string>();

  const sortedBookmarks = bookmarks.toSorted((a, b) => a.id.localeCompare(b.id));
  const candidates = sortedBookmarks.map((bookmark) => ({
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
  }));

  for (const bookmark of sortedBookmarks) {
    if (seenBookmarkIds.has(bookmark.id)) {
      throw new Error(`[SlugManager] Duplicate bookmark id in refresh input: ${bookmark.id}.`);
    }
    seenBookmarkIds.add(bookmark.id);

    const suppliedSlug =
      typeof bookmark.slug === "string" && bookmark.slug.trim().length > 0 ? bookmark.slug : null;
    const candidate =
      persistedById.get(bookmark.id) ??
      suppliedSlug ??
      generateUniqueSlug(bookmark.url, candidates, bookmark.id, bookmark.title);

    if (!candidate) {
      throw new Error(
        `[SlugManager] CRITICAL: Failed to generate slug for bookmark ${bookmark.id}. ` +
          `URL: ${bookmark.url}, Title: ${bookmark.title}`,
      );
    }

    const slug = allocateAvailableSlug(candidate, bookmark.id, slugOwners);
    slugs[bookmark.id] = {
      id: bookmark.id,
      slug,
      url: bookmark.url,
      title: bookmark.title || bookmark.url,
    };
    reverseMap[slug] = bookmark.id;
    slugOwners.set(slug, bookmark.id);
  }

  const checksumPayload = Object.keys(slugs)
    .toSorted((a, b) => a.localeCompare(b))
    .map((id) => [id, slugs[id]?.slug]);

  return bookmarkSlugMappingSchema.parse({
    version: "1.0.0",
    generated: new Date(getDeterministicTimestamp()).toISOString(),
    count: bookmarks.length,
    checksum: createHash("md5").update(JSON.stringify(checksumPayload)).digest("hex"),
    slugs,
    reverseMap,
  });
}

/**
 * Generate deterministic slug mapping for all bookmarks.
 * Ensures every bookmark gets a unique, stable slug for routing.
 *
 * @param bookmarks - Array of normalized bookmarks
 * @returns Mapping with slugs, reverse lookup, and checksum
 * @throws Error if any bookmark cannot generate a slug
 */
export function generateSlugMapping(bookmarks: readonly BookmarkSlugSource[]): BookmarkSlugMapping {
  return buildSlugMapping(bookmarks, []);
}

/** Reconcile fresh records against the persisted slug ownership map. */
export function reconcileSlugMapping(
  bookmarks: readonly BookmarkSlugSource[],
  persistedSlugs: readonly PersistedBookmarkSlug[],
): BookmarkSlugMapping {
  return buildSlugMapping(bookmarks, persistedSlugs);
}

export function applySlugMapping(
  bookmarks: readonly UnifiedBookmark[],
  mapping: BookmarkSlugMapping,
): UnifiedBookmark[] {
  return bookmarks.map((bookmark) => {
    const entry = mapping.slugs[bookmark.id];
    if (!entry) {
      throw new Error(`[SlugManager] Missing slug mapping for bookmark ${bookmark.id}.`);
    }
    return { ...bookmark, slug: entry.slug };
  });
}

/**
 * Validate and publish slug mapping updates in PostgreSQL-backed mode.
 *
 * In DB-backed mode, bookmark rows are the source of truth and this function
 * validates deterministic mapping generation plus cache invalidation.
 *
 * @param bookmarks - Array of bookmarks to generate mapping from
 * @param overwrite - Kept for API compatibility; ignored in DB mode
 */
export async function saveSlugMapping(
  bookmarks: readonly BookmarkSlugSource[],
  overwrite = true,
): Promise<void> {
  void overwrite;
  logSlugEnvironmentOnce("save");
  if (isSlugManagerLoggingEnabled) {
    logger.info("[SlugManager] Validating slug mapping in PostgreSQL mode");
  }

  try {
    const mapping = generateSlugMapping(bookmarks);
    if (isSlugManagerLoggingEnabled) {
      logger.info(
        `[SlugManager] Generated mapping with ${mapping.count} entries, checksum: ${mapping.checksum}`,
      );
    }

    if (isSlugManagerLoggingEnabled) {
      logger.info(
        `[SlugManager] Slug mapping checksum in PostgreSQL mode: ${mapping.checksum} (${mapping.count} entries)`,
      );
    }

    // Cache invalidation after successful save
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
        bookmarkCount: bookmarks.length,
      });
    }

    throw error;
  }
}

/**
 * Load slug mapping from PostgreSQL bookmarks table.
 *
 * @returns Slug mapping if found, null if not found or on error
 */
export async function loadSlugMapping(): Promise<BookmarkSlugMapping | null> {
  if (isSlugManagerLoggingEnabled) {
    logger.info("[SlugManager] Attempting to load slug mapping from PostgreSQL");
  }
  logSlugEnvironmentOnce("load");

  try {
    const slugRows = await getSlugMappingRowsFromDatabase();
    if (slugRows.length === 0) {
      if (isSlugManagerLoggingEnabled) {
        logger.info("[SlugManager] No slug mapping rows found in PostgreSQL");
      }
      return null;
    }

    const mapping = buildSlugMapping(slugRows, slugRows);

    if (isSlugManagerLoggingEnabled) {
      logger.info(
        `[SlugManager] Loaded slug mapping with ${mapping.count} entries from PostgreSQL`,
      );
    }
    return mapping;
  } catch (error) {
    logger.error("[SlugManager] Failed to load slug mapping from PostgreSQL:", error);
    // RC1a: error logged; null is the documented contract for callers
  }
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
  if (slug.trim().length === 0) {
    if (isSlugManagerLoggingEnabled) {
      logger.warn("[SlugManager] Empty slug received");
    }
    return null;
  }

  const bookmark = await getBookmarkBySlugFromDatabase(slug);
  if (!bookmark) {
    if (isSlugManagerLoggingEnabled) {
      logger.warn(`[SlugManager] No bookmark found for slug: ${slug}`);
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
    .map(buildBookmarkPath);
}
