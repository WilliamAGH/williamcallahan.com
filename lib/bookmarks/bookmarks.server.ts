/**
 * Bookmarks Server API
 *
 * Server-side only bookmark operations
 * Handles file system access and build-time operations
 *
 * @module lib/bookmarks.server
 */

import type { UnifiedBookmark, LightweightBookmark } from "@/types";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { stripImageData } from "../bookmarks/utils";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";

/**
 * Get minimal bookmark data for static site generation (sitemap, static params)
 *
 * Returns bookmarks with REQUIRED fields (id, slug, url, title) but WITHOUT heavy image data.
 * This allows sitemap generation and static route generation while keeping build times fast.
 *
 * CRITICAL: Every bookmark MUST have a slug for idempotent routing.
 * If bookmarks don't have slugs, they cannot be included in sitemap or static generation.
 * 
 * @returns Empty array synchronously - use getBookmarksForStaticBuildAsync for actual data
 */
export function getBookmarksForStaticBuild(): UnifiedBookmark[] {
  console.log("[Static Build] Synchronous method called - returning empty array. Use async version for actual data.");
  return [];
}

/**
 * Get minimal bookmark data for static site generation (async version)
 *
 * Returns lightweight bookmarks with REQUIRED slugs for sitemap and static route generation.
 * Strips heavy image data to keep memory usage low during build.
 *
 * CRITICAL: Every returned bookmark is GUARANTEED to have both id and slug fields.
 */
export async function getBookmarksForStaticBuildAsync(): Promise<LightweightBookmark[]> {
  console.log("[Static Build] Loading bookmarks with slugs for sitemap/static generation...");

  try {
    // Load full bookmarks from S3
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    
    if (!bookmarks || !Array.isArray(bookmarks)) {
      console.warn("[Static Build] No bookmarks found in S3");
      return [];
    }

    // Attempt to load precomputed slug mapping so we can include bookmarks that
    // don't yet have an embedded slug field in the persisted dataset. This keeps
    // sitemap/static generation resilient during migrations.
    let slugMapping = await loadSlugMapping().catch(() => null);

    // If no mapping exists or it's empty, generate one dynamically
    if (!slugMapping || Object.keys(slugMapping.slugs).length === 0) {
      console.log("[Static Build] No valid slug mapping found, generating dynamically...");
      const { generateSlugMapping } = await import("@/lib/bookmarks/slug-manager");
      slugMapping = generateSlugMapping(bookmarks);
      console.log(`[Static Build] Generated slug mapping with ${Object.keys(slugMapping.slugs).length} entries`);
    }

    // Validate that all bookmarks have required fields (id and slug)
    const validBookmarks = bookmarks
      .map((b) => {
        // If slug missing, try to hydrate from mapping (when available)
        if (!b.slug && slugMapping && slugMapping.slugs[b.id]?.slug) {
          return { ...b, slug: slugMapping.slugs[b.id]?.slug } as UnifiedBookmark;
        }
        return b;
      })
      .filter((b) => {
        if (!b.id || !b.slug) {
          console.error(
            `[Static Build] CRITICAL: Bookmark missing required fields - ` +
              `ID: ${b.id || "MISSING"}, Slug: ${b.slug || "MISSING"}, Title: ${b.title || "UNKNOWN"}`,
          );
          return false;
        }
        return true;
      });

    if (validBookmarks.length !== bookmarks.length) {
      console.error(
        `[Static Build] ERROR: ${bookmarks.length - validBookmarks.length} bookmarks missing id or slug! ` +
        `Only ${validBookmarks.length} of ${bookmarks.length} will be included in sitemap.`
      );
    }

    // Convert to lightweight bookmarks to reduce memory usage
    const lightweightBookmarks = validBookmarks.map(b => stripImageData(b));
    
    console.log(
      `[Static Build] Successfully loaded ${lightweightBookmarks.length} bookmarks with slugs for static generation`
    );
    
    return lightweightBookmarks;
  } catch (error) {
    console.error("[Static Build] Failed to load bookmarks from S3:", error);
    // Return empty array to prevent build failures
    // This means no bookmark URLs in sitemap but build continues
    return [];
  }
}
