/**
 * Centralized slug helpers for bookmark URLs
 *
 * These helpers ensure consistent slug usage across server and client components
 * by using pre-computed mappings instead of generating slugs on-the-fly.
 */

import { readSlugShard } from "./slug-shards";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";
import type { BookmarkSlugMapping } from "@/types/bookmark";
import { getSlugCacheTTL } from "@/config/related-content.config";
import { cacheContextGuards, USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import logger from "@/lib/utils/logger";

const CACHE_TTL_SECONDS = Math.max(1, Math.ceil(getSlugCacheTTL() / 1000));
const SLUG_MAPPING_CACHE_TAG = "bookmark-slug-mapping";
let slugManagerModulePromise: Promise<typeof import("./slug-manager")> | null = null;

const loadSlugManagerModule = async (): Promise<typeof import("./slug-manager")> => {
  slugManagerModulePromise ??= import("./slug-manager");
  return slugManagerModulePromise;
};

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

async function loadSlugMappingDirect(): Promise<BookmarkSlugMapping | null> {
  const { loadSlugMapping } = await loadSlugManagerModule();
  const mapping = await loadSlugMapping();
  if (!mapping) {
    return null;
  }
  return normalizeReverseMap(mapping).normalized;
}

async function loadSlugMappingCached(): Promise<BookmarkSlugMapping | null> {
  "use cache";
  cacheContextGuards.cacheLife("SlugHelpers", { revalidate: CACHE_TTL_SECONDS });
  cacheContextGuards.cacheTag("SlugHelpers", SLUG_MAPPING_CACHE_TAG);
  return loadSlugMappingDirect();
}

async function resolveSlugMapping(): Promise<BookmarkSlugMapping | null> {
  if (!USE_NEXTJS_CACHE) {
    return loadSlugMappingDirect();
  }
  return withCacheFallback(
    () => loadSlugMappingCached(),
    () => loadSlugMappingDirect(),
  );
}

async function loadOrGenerateSlugMapping(
  bookmarks?: UnifiedBookmark[],
): Promise<BookmarkSlugMapping | null> {
  const existing = await resolveSlugMapping();
  if (existing) {
    return existing;
  }

  if (!bookmarks) {
    return null;
  }

  const { generateSlugMapping, saveSlugMapping } = await loadSlugManagerModule();
  const generated = generateSlugMapping(bookmarks);
  try {
    await saveSlugMapping(bookmarks);
  } catch (error) {
    logger.error("[CRITICAL] Failed to save slug mapping - bookmark navigation may fail", {
      error,
      bookmarkCount: bookmarks.length,
    });
  }

  return normalizeReverseMap(generated).normalized;
}

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
 * Get the slug for a bookmark, using pre-computed mappings for hydration safety.
 */
export async function getSafeBookmarkSlug(
  bookmarkId: string,
  bookmarks?: UnifiedBookmark[],
): Promise<string | null> {
  if (bookmarks && Array.isArray(bookmarks)) {
    const found = bookmarks.find((bookmark) => bookmark.id === bookmarkId);
    const embeddedSlug = tryGetEmbeddedSlug(found);
    if (embeddedSlug) return embeddedSlug;
  }

  const mapping = await loadOrGenerateSlugMapping(bookmarks);
  if (!mapping) {
    logger.error(`[SlugHelpers] No slug mapping available for bookmark ${bookmarkId}`);
    return null;
  }

  const { getSlugForBookmark } = await loadSlugManagerModule();
  return getSlugForBookmark(mapping, bookmarkId);
}

/**
 * Get slugs for multiple bookmarks efficiently.
 */
export async function getBulkBookmarkSlugs(
  bookmarks: UnifiedBookmark[],
): Promise<Map<string, string>> {
  const slugMap = new Map<string, string>();

  let hasAllEmbedded = true;
  for (const bookmark of bookmarks) {
    const embeddedSlug = tryGetEmbeddedSlug(bookmark);
    if (!embeddedSlug) {
      hasAllEmbedded = false;
      break;
    }
  }

  if (hasAllEmbedded) {
    for (const bookmark of bookmarks) {
      const embeddedSlug = tryGetEmbeddedSlug(bookmark);
      if (embeddedSlug) slugMap.set(bookmark.id, embeddedSlug);
    }
    return slugMap;
  }

  const mapping = await loadOrGenerateSlugMapping(bookmarks);
  if (!mapping) {
    return slugMap;
  }

  const { getSlugForBookmark } = await loadSlugManagerModule();
  for (const bookmark of bookmarks) {
    const slug = getSlugForBookmark(mapping, bookmark.id);
    if (slug) {
      slugMap.set(bookmark.id, slug);
    }
  }

  return slugMap;
}

/**
 * Invalidate cached slug mapping reads.
 */
export function resetSlugCache(): void {
  cacheContextGuards.revalidateTag("SlugHelpers", SLUG_MAPPING_CACHE_TAG);
}

async function loadReverseSlugMap(): Promise<Map<string, string> | null> {
  const mapping = await resolveSlugMapping();
  if (!mapping) {
    return null;
  }

  const normalized = normalizeReverseMap(mapping).normalized;
  return new Map<string, string>(Object.entries(normalized.reverseMap));
}

export async function resolveBookmarkIdFromSlug(slug: string): Promise<string | null> {
  const shardEntry = await readSlugShard(slug);
  if (shardEntry?.id) {
    return shardEntry.id;
  }

  const reverse = await loadReverseSlugMap();
  return reverse?.get(slug) ?? null;
}
