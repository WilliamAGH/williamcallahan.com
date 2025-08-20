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
 * CRITICAL: Proper priority order for Karakeep bookmarks:
 * 1. Already persisted S3 CDN URLs (from ogImage) - BEST PERFORMANCE
 * 2. Karakeep image asset (content.imageAssetId) - HIGH QUALITY
 * 3. Karakeep screenshot asset (content.screenshotAssetId) - GOOD FALLBACK
 * 4. Any other ogImage we might have fetched ourselves
 *
 * NOTE: content.imageUrl is EXCLUDED as it's typically just a logo/favicon
 * and not suitable for OpenGraph or preview cards.
 *
 * @param bookmark The bookmark to select an image for
 * @param options Configuration options for image selection
 * @returns The selected image URL or null/undefined if no image is available
 *
 * @example
 * ```typescript
 * // Default behavior - prioritize quality images
 * const imageUrl = selectBestImage(bookmark);
 *
 * // Exclude screenshots from fallback
 * const imageUrl = selectBestImage(bookmark, { includeScreenshots: false });
 * ```
 */
export function selectBestImage(
  bookmark: Pick<UnifiedBookmark, "ogImage" | "content">,
  options: ImageSelectionOptions = {},
): string | null | undefined {
  const { includeScreenshots = true, returnUndefined = false } = options;

  const { content } = bookmark;
  const noImageResult = returnUndefined ? undefined : null;
  const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || process.env.S3_CDN_URL || "";

  // PRIORITY 1: Already persisted to our S3 (best performance)
  if (bookmark.ogImage && s3CdnUrl && bookmark.ogImage.includes(s3CdnUrl)) {
    return bookmark.ogImage;
  }

  // PRIORITY 2: Karakeep image asset (high quality, dedicated image)
  if (content?.imageAssetId) {
    return getAssetUrl(content.imageAssetId);
  }

  // PRIORITY 3: Karakeep screenshot asset (good quality fallback)
  if (includeScreenshots && content?.screenshotAssetId) {
    return getAssetUrl(content.screenshotAssetId);
  }

  // PRIORITY 4: Any other ogImage we might have fetched ourselves
  if (bookmark.ogImage) {
    return bookmark.ogImage;
  }

  // NEVER use content.imageUrl - it's typically just a logo/favicon, not suitable for cards
  
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
export function createKarakeepFallback(
  content: BookmarkContent | undefined,
  baseUrl = "",
  idempotencyKey?: string,
): KarakeepImageFallback {
  if (!content) {
    return {
      karakeepBaseUrl: baseUrl,
      idempotencyKey: idempotencyKey || undefined,
    };
  }

  return {
    imageUrl: typeof content.imageUrl === "string" ? content.imageUrl : null,
    imageAssetId: typeof content.imageAssetId === "string" ? content.imageAssetId : null,
    screenshotAssetId: typeof content.screenshotAssetId === "string" ? content.screenshotAssetId : null,
    karakeepBaseUrl: baseUrl,
    idempotencyKey: idempotencyKey || undefined,
  };
}
