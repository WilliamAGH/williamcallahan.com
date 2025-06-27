/**
 * Bookmark Helper Utilities
 *
 * Provides consistent URL construction and other bookmark-related utilities
 */

import type { UnifiedBookmark, BookmarkContent, KarakeepImageFallback } from "@/types";
import type { ImageSelectionOptions } from "@/types/features/bookmarks";

/**
 * Constructs a consistent asset URL for Karakeep assets
 * @param assetId The asset ID from Karakeep
 * @returns The full asset URL or undefined
 */
export function getAssetUrl(assetId: string | undefined | null): string | undefined {
  if (!assetId) return undefined;

  // Always use API proxy to ensure correct content-type is preserved
  // This guarantees that images work regardless of their actual format (jpg, png, gif, webp, etc.)
  return `/api/assets/${assetId}`;
}

/**
 * Selects the best available image for a bookmark based on priority order
 *
 * CRITICAL: This function now prioritizes S3 CDN URLs to avoid proxy overhead
 * 
 * Priority order:
 * 1. S3 CDN URLs (from ogImage or content.imageUrl) - ALWAYS PREFERRED
 * 2. Direct HTTP URLs (already hosted externally)
 * 3. OpenGraph image (if preferOpenGraph is true and not already checked)
 * 4. Karakeep imageUrl from content (if not already checked)
 * 5. Karakeep imageAssetId (converted to proxy URL - LAST RESORT)
 * 6. Karakeep screenshotAssetId (if includeScreenshots is true - LAST RESORT)
 * 7. null/undefined (based on returnUndefined option)
 *
 * @param bookmark The bookmark to select an image for
 * @param options Configuration options for image selection
 * @returns The selected image URL or null/undefined if no image is available
 *
 * @example
 * ```typescript
 * // Default behavior - prefer S3 URLs, then OpenGraph
 * const imageUrl = selectBestImage(bookmark);
 *
 * // Prefer Karakeep images over OpenGraph (but S3 still wins)
 * const imageUrl = selectBestImage(bookmark, { preferOpenGraph: false });
 *
 * // Exclude screenshots from fallback
 * const imageUrl = selectBestImage(bookmark, { includeScreenshots: false });
 * ```
 */
export function selectBestImage(
  bookmark: Pick<UnifiedBookmark, "ogImage" | "content">,
  options: ImageSelectionOptions = {},
): string | null | undefined {
  const { preferOpenGraph = true, includeScreenshots = true, returnUndefined = false } = options;

  const { content } = bookmark;
  const noImageResult = returnUndefined ? undefined : null;
  const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || "";

  // Build prioritized image list based on S3 CDN preference
  const candidates: (string | undefined)[] = [];

  // PRIORITY 1: Always check for S3 CDN URLs first (best performance)
  if (bookmark.ogImage?.includes(s3CdnUrl)) {
    candidates.push(bookmark.ogImage);
  }
  if (content?.imageUrl?.includes(s3CdnUrl)) {
    candidates.push(content.imageUrl);
  }

  // PRIORITY 2: Direct HTTP URLs (no proxy needed)
  if (bookmark.ogImage?.startsWith("http") && !bookmark.ogImage.includes(s3CdnUrl)) {
    candidates.push(bookmark.ogImage);
  }
  if (content?.imageUrl?.startsWith("http") && !content.imageUrl.includes(s3CdnUrl)) {
    candidates.push(content.imageUrl);
  }

  // PRIORITY 3: Add remaining based on preference (these might need proxy)
  if (preferOpenGraph && bookmark.ogImage && !bookmark.ogImage.startsWith("http")) {
    candidates.push(bookmark.ogImage);
  }

  if (content?.imageUrl && !content.imageUrl.startsWith("http")) {
    candidates.push(content.imageUrl);
  }

  // PRIORITY 4: Asset IDs (requires proxy - avoid if possible)
  if (content?.imageAssetId) {
    // Only use if we have no better options
    candidates.push(getAssetUrl(content.imageAssetId));
  }

  // Add OpenGraph after Karakeep if not preferred
  if (!preferOpenGraph && bookmark.ogImage && !bookmark.ogImage.startsWith("http")) {
    candidates.push(bookmark.ogImage);
  }

  // PRIORITY 5: Screenshot as last resort (requires proxy)
  if (includeScreenshots && content?.screenshotAssetId) {
    candidates.push(getAssetUrl(content.screenshotAssetId));
  }

  // Return first non-null/undefined candidate
  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }

  return noImageResult;
}

/**
 * Creates a Karakeep fallback object for OpenGraph data fetching
 *
 * @param content The bookmark content object
 * @param baseUrl The Karakeep API base URL
 * @param idempotencyKey Optional unique key for idempotent storage (e.g., bookmark ID)
 * @returns KarakeepImageFallback object for OpenGraph fallback
 */
export function createKarakeepFallback(content: BookmarkContent | undefined, baseUrl = "", idempotencyKey?: string): KarakeepImageFallback {
  if (!content) {
    return { 
      karakeepBaseUrl: baseUrl,
      idempotencyKey: idempotencyKey || undefined
    };
  }

  return {
    imageUrl: typeof content.imageUrl === "string" ? content.imageUrl : null,
    imageAssetId: typeof content.imageAssetId === "string" ? content.imageAssetId : null,
    screenshotAssetId: typeof content.screenshotAssetId === "string" ? content.screenshotAssetId : null,
    karakeepBaseUrl: baseUrl,
    idempotencyKey: idempotencyKey || undefined
  };
}
