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
  
  // Use direct CDN URL if available, otherwise fall back to API proxy
  const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL;
  if (cdnUrl) {
    return `${cdnUrl}/images/${assetId}`;
  }
  
  return `/api/assets/${assetId}`;
}

/**
 * Selects the best available image for a bookmark based on priority order
 *
 * Priority order (configurable):
 * 1. OpenGraph image (if available and preferOpenGraph is true)
 * 2. Karakeep imageUrl from content
 * 3. Karakeep imageAssetId (converted to URL)
 * 4. Karakeep screenshotAssetId (if includeScreenshots is true)
 * 5. null/undefined (based on returnUndefined option)
 *
 * @param bookmark The bookmark to select an image for
 * @param options Configuration options for image selection
 * @returns The selected image URL or null/undefined if no image is available
 *
 * @example
 * ```typescript
 * // Default behavior - prefer OpenGraph
 * const imageUrl = selectBestImage(bookmark);
 *
 * // Prefer Karakeep images over OpenGraph
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

  // Build prioritized image list based on options
  const candidates: (string | undefined)[] = [];

  if (preferOpenGraph && bookmark.ogImage) {
    candidates.push(bookmark.ogImage);
  }

  if (content?.imageUrl) {
    candidates.push(content.imageUrl);
  }

  if (content?.imageAssetId) {
    candidates.push(getAssetUrl(content.imageAssetId));
  }

  // Add OpenGraph after Karakeep if not preferred
  if (!preferOpenGraph && bookmark.ogImage) {
    candidates.push(bookmark.ogImage);
  }

  // Add screenshot as last resort
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
 * @returns KarakeepImageFallback object for OpenGraph fallback
 */
export function createKarakeepFallback(content: BookmarkContent | undefined, baseUrl = ""): KarakeepImageFallback {
  if (!content) {
    return { karakeepBaseUrl: baseUrl };
  }

  return {
    imageUrl: typeof content.imageUrl === "string" ? content.imageUrl : null,
    imageAssetId: typeof content.imageAssetId === "string" ? content.imageAssetId : null,
    screenshotAssetId: typeof content.screenshotAssetId === "string" ? content.screenshotAssetId : null,
    karakeepBaseUrl: baseUrl,
  };
}
