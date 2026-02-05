/**
 * Centralized slug helpers for bookmark URLs
 *
 * These helpers ensure consistent slug usage across server and client components
 * by using pre-computed mappings instead of generating slugs on-the-fly.
 */

import {
  loadSlugMapping,
  generateSlugMapping,
  getSlugForBookmark,
  saveSlugMapping,
} from "./slug-manager";
import { readSlugShard } from "./slug-shards";
import type { UnifiedBookmark } from "@/types";
import type { CachedSlugMapping } from "@/types/cache";
import type { BookmarkSlugMapping } from "@/types/bookmark";
import logger from "@/lib/utils/logger";
import { getDeterministicTimestamp } from "@/lib/utils/deterministic-timestamp";

// Cache the slug mapping with TTL for automatic invalidation
let cachedMapping: CachedSlugMapping | null = null;
let cachedReverseMap: { map: Map<string, string>; timestamp: number } | null = null;

// Import cache TTL from configuration
import { getSlugCacheTTL } from "@/config/related-content.config";

const CACHE_TTL_MS = getSlugCacheTTL();

const normalizeReverseMap = (
  mapping: BookmarkSlugMapping,
): { normalized: BookmarkSlugMapping; rebuilt: boolean } => {
  if (mapping.reverseMap && Object.keys(mapping.reverseMap).length > 0) {
    return { normalized: mapping, rebuilt: false };
  }

  const rebuilt: Record<string, string> = {};
  for (const entry of Object.values(mapping.slugs ?? {})) {
    if (!entry?.slug || !entry?.id) continue;
    if (!(entry.slug in rebuilt)) {
      rebuilt[entry.slug] = entry.id;
    }
  }

  logger.warn(
    `[SlugHelpers] reverseMap missing or empty; rebuilt ${Object.keys(rebuilt).length} entries from forward mapping`,
  );

  return {
    normalized: {
      ...mapping,
      reverseMap: rebuilt as Readonly<Record<string, string>>,
    },
    rebuilt: true,
  };
};

/**
 * Safely extract an embedded slug from an unknown bookmark-like object.
 * Uses runtime checks to satisfy strict type safety without unsafe assumptions.
 */
export function tryGetEmbeddedSlug(input: unknown): string | null {
  if (input && typeof input === "object" && "slug" in (input as Record<string, unknown>)) {
    const val = (input as Record<string, unknown>).slug;
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

/**
 * Regex pattern for URL slug sanitization.
 * Matches any sequence of characters that are NOT alphanumeric (a-z, A-Z, 0-9).
 * These sequences are replaced with hyphens to create URL-safe slugs.
 */
const SLUG_SANITIZE_PATTERN = /[^a-z0-9]+/gi;

/**
 * Length of the ID prefix appended to fallback slugs.
 * Uses first 8 characters of UUID to ensure uniqueness while keeping slugs readable.
 * 8 hex chars = 32 bits of entropy = 4 billion combinations, sufficient for bookmark deduplication.
 */
const FALLBACK_SLUG_ID_PREFIX_LENGTH = 8;

/**
 * Generate a fallback slug from a URL and bookmark ID.
 * Used when no embedded or mapped slug is available.
 *
 * Slug format: URL sanitized to alphanumeric + hyphens, plus first N chars of ID.
 * Example: "https://example.com/article" + "abc12345-..." → "https-example-com-article-abc12345"
 *
 * @param url - The bookmark URL
 * @param id - The bookmark ID (UUID)
 * @returns A URL-safe slug with truncated ID suffix
 */
export function generateFallbackSlug(url: string, id: string): string {
  return `${url.replace(SLUG_SANITIZE_PATTERN, "-").toLowerCase()}-${id.slice(0, FALLBACK_SLUG_ID_PREFIX_LENGTH)}`;
}

/**
 * Get the slug for a bookmark, using pre-computed mappings for hydration safety
 *
 * @param bookmarkId - The bookmark ID to get slug for
 * @param bookmarks - Optional array of all bookmarks (used to generate mapping if needed)
 * @returns The slug for the bookmark, or null if not found
 */
export async function getSafeBookmarkSlug(
  bookmarkId: string,
  bookmarks?: UnifiedBookmark[],
): Promise<string | null> {
  // Try to use cached mapping first (check TTL)
  if (cachedMapping) {
    const age = getDeterministicTimestamp() - cachedMapping.timestamp;
    if (age < CACHE_TTL_MS) {
      return getSlugForBookmark(cachedMapping.data, bookmarkId);
    }
    cachedMapping = null;
    cachedReverseMap = null;
  }

  // If bookmarks supplied, try embedded slug first
  if (bookmarks && Array.isArray(bookmarks)) {
    const found = bookmarks.find((b) => b.id === bookmarkId);
    const embeddedSlug = tryGetEmbeddedSlug(found);
    if (embeddedSlug) return embeddedSlug;
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
        bookmarkCount: bookmarks.length,
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
      timestamp: getDeterministicTimestamp(),
    };
    cachedReverseMap = null;
  }

  return mapping ? getSlugForBookmark(mapping, bookmarkId) : null;
}

/**
 * Get slugs for multiple bookmarks efficiently
 *
 * @param bookmarks - Array of bookmarks to get slugs for
 * @returns Map of bookmark ID to slug
 */
export async function getBulkBookmarkSlugs(
  bookmarks: UnifiedBookmark[],
): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>();

  // Fast path: use embedded slugs when present
  let hasAllEmbedded = true;
  for (const b of bookmarks) {
    const s = tryGetEmbeddedSlug(b);
    if (!s) {
      hasAllEmbedded = false;
      break;
    }
  }
  if (hasAllEmbedded) {
    for (const b of bookmarks) {
      const s = tryGetEmbeddedSlug(b);
      if (s) slugMap.set(b.id, s);
    }
    return slugMap;
  }

  // Check cache next (with TTL)
  if (cachedMapping) {
    const age = getDeterministicTimestamp() - cachedMapping.timestamp;
    if (age < CACHE_TTL_MS) {
      for (const bookmark of bookmarks) {
        const slug = getSlugForBookmark(cachedMapping.data, bookmark.id);
        if (slug) {
          slugMap.set(bookmark.id, slug);
        }
      }
      return slugMap;
    }
    cachedMapping = null;
    cachedReverseMap = null;
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
        bookmarkCount: bookmarks.length,
      });
      // Continue with the generated mapping even if save failed
    }
  }

  // Cache for subsequent calls with timestamp
  if (mapping) {
    cachedMapping = {
      data: mapping,
      timestamp: getDeterministicTimestamp(),
    };
    cachedReverseMap = null;
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
  cachedReverseMap = null;
}

async function loadReverseSlugMap(): Promise<Map<string, string> | null> {
  const now = getDeterministicTimestamp();
  if (cachedReverseMap && cachedMapping && now - cachedReverseMap.timestamp < CACHE_TTL_MS) {
    return cachedReverseMap.map;
  }

  let mappingData: CachedSlugMapping["data"] | null = null;
  if (cachedMapping && now - cachedMapping.timestamp < CACHE_TTL_MS) {
    mappingData = cachedMapping.data;
  } else {
    const mapping = await loadSlugMapping();
    if (!mapping) return null;
    cachedMapping = { data: mapping, timestamp: now };
    mappingData = mapping;
  }

  const { normalized, rebuilt } = normalizeReverseMap(mappingData);
  if (rebuilt) {
    const timestamp = cachedMapping?.timestamp ?? now;
    cachedMapping = { data: normalized, timestamp };
  }

  const reverse = new Map<string, string>(Object.entries(normalized.reverseMap));
  cachedReverseMap = { map: reverse, timestamp: now };
  return reverse;
}

export async function resolveBookmarkIdFromSlug(slug: string): Promise<string | null> {
  const shardEntry = await readSlugShard(slug);
  if (shardEntry?.id) {
    const now = getDeterministicTimestamp();
    if (cachedReverseMap) {
      cachedReverseMap.map.set(slug, shardEntry.id);
      cachedReverseMap.timestamp = now;
    } else {
      cachedReverseMap = {
        map: new Map([[slug, shardEntry.id]]),
        timestamp: now,
      };
    }
    return shardEntry.id;
  }

  const reverse = await loadReverseSlugMap();
  return reverse?.get(slug) ?? null;
}
