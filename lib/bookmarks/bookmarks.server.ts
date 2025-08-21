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
 * DEPRECATED: Synchronous bookmark fetcher that ALWAYS returns empty array
 *
 * CRITICAL BUG (Issue #sitemap-2024): This function was causing sitemap generation failures
 * because Next.js generateStaticParams() requires synchronous data during build, but bookmarks
 * are stored in S3 (async-only). Blog posts work because they're read from local filesystem
 * synchronously via fs.readFileSync(). Bookmarks fail because S3 has no sync API.
 *
 * @deprecated Use getBookmarksForStaticBuildAsync() instead
 * @see https://nextjs.org/docs/app/api-reference/functions/generate-static-params
 * @returns Empty array - NEVER use for sitemap/static generation
 */
export function getBookmarksForStaticBuild(): UnifiedBookmark[] {
  if (process.env.NODE_ENV === "development") {
    console.log("[Static Build] Synchronous method called - returning empty array. Use async version for actual data.");
  }
  return [];
}

/**
 * Async bookmark fetcher for static site generation (sitemap, generateStaticParams)
 *
 * CRITICAL FOR SITEMAP: This MUST be called during Docker build (before 'next build')
 * to ensure bookmark data exists when sitemap.ts runs. Unlike blog posts (local files),
 * bookmarks require S3 access which only works if credentials are provided at build time.
 *
 * @see Dockerfile:98-106 - Fetches bookmark data BEFORE build
 * @see app/sitemap.ts:149 - Uses this to generate bookmark URLs
 * @returns Bookmarks with guaranteed id+slug fields, or empty array if S3 unavailable
 */
export async function getBookmarksForStaticBuildAsync(): Promise<LightweightBookmark[]> {
  console.log("[Static Build] Loading bookmarks with slugs for sitemap/static generation...");

  try {
    // Load full bookmarks from S3
    const rawData = await readJsonS3<unknown>(BOOKMARKS_S3_PATHS.FILE);

    if (!rawData || !Array.isArray(rawData)) {
      console.warn("[Static Build] No bookmarks found in S3 or invalid format");
      return [];
    }

    // Validate and ensure all bookmarks have required fields
    const bookmarks = rawData as UnifiedBookmark[];
    console.log(`[Static Build] Loaded ${bookmarks.length} bookmarks from S3 path: ${BOOKMARKS_S3_PATHS.FILE}`);

    // Attempt to load precomputed slug mapping so we can include bookmarks that
    // don't yet have an embedded slug field in the persisted dataset. This keeps
    // sitemap/static generation resilient during migrations.
    let slugMapping = await loadSlugMapping().catch(() => null);

    // If no mapping exists or it's empty, generate one dynamically
    if (!slugMapping?.slugs || Object.keys(slugMapping.slugs).length === 0) {
      console.log("[Static Build] No valid slug mapping found, generating dynamically...");
      const { generateSlugMapping } = await import("@/lib/bookmarks/slug-manager");
      // Ensure all bookmarks have URLs before attempting to generate slugs
      const bookmarksWithUrls = bookmarks.filter(b => Boolean(b.url));
      if (bookmarksWithUrls.length < bookmarks.length) {
        console.warn(
          `[Static Build] Filtered out ${bookmarks.length - bookmarksWithUrls.length} bookmarks without URLs`,
        );
      }
      slugMapping = generateSlugMapping(bookmarksWithUrls);
      console.log(`[Static Build] Generated slug mapping with ${Object.keys(slugMapping.slugs).length} entries`);
    }

    // First, check how many bookmarks already have embedded slugs
    const bookmarksWithEmbeddedSlugs = bookmarks.filter(b => b.slug);
    console.log(
      `[Static Build] ${bookmarksWithEmbeddedSlugs.length}/${bookmarks.length} bookmarks have embedded slugs`,
    );

    // If some bookmarks lack slugs, log details
    if (bookmarksWithEmbeddedSlugs.length < bookmarks.length) {
      const missingSlugSample = bookmarks
        .filter(b => !b.slug)
        .slice(0, 3)
        .map(b => `ID: ${b.id}, Title: ${b.title || "UNKNOWN"}`)
        .join("; ");
      console.warn(`[Static Build] Sample bookmarks missing embedded slugs: ${missingSlugSample}`);
    }

    // Validate that all bookmarks have required fields (id and slug)
    const validBookmarks = bookmarks
      .map(b => {
        // If slug missing, try to hydrate from mapping (when available)
        if (!b.slug && slugMapping?.slugs && slugMapping.slugs[b.id]?.slug) {
          console.log(
            `[Static Build] Hydrating slug for bookmark ${b.id} from mapping: ${slugMapping.slugs[b.id]?.slug}`,
          );
          return { ...b, slug: slugMapping.slugs[b.id]?.slug } as UnifiedBookmark;
        }
        return b;
      })
      .filter(b => {
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
          `Only ${validBookmarks.length} of ${bookmarks.length} will be included in sitemap.`,
      );
    }

    // Convert to lightweight bookmarks to reduce memory usage
    const lightweightBookmarks = validBookmarks.map(b => stripImageData(b));

    console.log(
      `[Static Build] Successfully loaded ${lightweightBookmarks.length} bookmarks with slugs for static generation`,
    );

    return lightweightBookmarks;
  } catch (error) {
    console.error("[Static Build] Failed to load bookmarks from S3:", error);
    // Return empty array to prevent build failures
    // This means no bookmark URLs in sitemap but build continues
    return [];
  }
}
