/**
 * Bookmark Helper Utilities
 * 
 * Provides consistent URL construction and other bookmark-related utilities
 */

import type { UnifiedBookmark, BookmarkContent } from "@/types";

/**
 * Constructs a consistent asset URL for Karakeep assets
 * @param assetId The asset ID from Karakeep
 * @returns The full asset URL or undefined
 */
export function getAssetUrl(assetId: string | undefined | null): string | undefined {
  if (!assetId) return undefined;
  // Future enhancement: could use CDN URL from environment
  return `/api/assets/${assetId}`;
}

/**
 * Options for image selection behavior
 */
export interface ImageSelectionOptions {
  /** Prefer OpenGraph images over Karakeep images (default: true) */
  preferOpenGraph?: boolean;
  /** Include screenshot assets as fallback (default: true) */
  includeScreenshots?: boolean;
  /** Return undefined instead of null for no image (default: false) */
  returnUndefined?: boolean;
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
  bookmark: Pick<UnifiedBookmark, 'ogImage' | 'content'>,
  options: ImageSelectionOptions = {}
): string | null | undefined {
  const {
    preferOpenGraph = true,
    includeScreenshots = true,
    returnUndefined = false
  } = options;
  
  const content = bookmark.content;
  const noImageResult = returnUndefined ? undefined : null;
  
  // Build prioritized image list based on options
  const candidates: (string | undefined)[] = [];
  
  if (preferOpenGraph && bookmark.ogImage) {
    candidates.push(bookmark.ogImage);
  }
  
  if (content) {
    // Add Karakeep images
    if (content.imageUrl) {
      candidates.push(content.imageUrl);
    }
    
    if (content.imageAssetId) {
      candidates.push(getAssetUrl(content.imageAssetId));
    }
    
    // Add OpenGraph after Karakeep if not preferred
    if (!preferOpenGraph && bookmark.ogImage) {
      candidates.push(bookmark.ogImage);
    }
    
    // Add screenshot as last resort
    if (includeScreenshots && content.screenshotAssetId) {
      candidates.push(getAssetUrl(content.screenshotAssetId));
    }
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
export function createKarakeepFallback(
  content: BookmarkContent | undefined,
  baseUrl: string = ''
): {
  imageUrl?: string;
  imageAssetId?: string;
  screenshotAssetId?: string;
  karakeepBaseUrl: string;
} {
  if (!content) {
    return { karakeepBaseUrl: baseUrl };
  }
  
  return {
    imageUrl: typeof content.imageUrl === 'string' ? content.imageUrl : undefined,
    imageAssetId: typeof content.imageAssetId === 'string' ? content.imageAssetId : undefined,
    screenshotAssetId: typeof content.screenshotAssetId === 'string' ? content.screenshotAssetId : undefined,
    karakeepBaseUrl: baseUrl,
  };
}