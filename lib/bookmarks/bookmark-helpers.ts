/**
 * Bookmark Helper Utilities
 *
 * Provides consistent URL construction and image selection for bookmarks.
 * Handles Karakeep/Hoarder asset URLs with optional context for S3 filenames.
 * 
 * @module lib/bookmarks/bookmark-helpers
 */

import type { UnifiedBookmark, BookmarkContent, KarakeepImageFallback } from "@/types";
import type { ImageSelectionOptions } from "@/types/features/bookmarks";

/**
 * Constructs a consistent asset URL for Karakeep assets.
 * 
 * Appends optional context as query parameters to enable descriptive S3 filenames.
 * The assets API uses this context to generate filenames like 'github-com-abc123.png'
 * instead of UUID-only names.
 * 
 * @param assetId - The asset ID from Karakeep/Hoarder
 * @param context - Optional bookmark context for descriptive filenames
 * @param context.bookmarkId - Used for hash generation in filenames
 * @param context.url - Used for domain extraction in filenames
 * @param context.domain - Pre-extracted domain (optimization)
 * @returns Asset proxy URL with encoded query parameters, or undefined if no assetId
 * 
 * @example
 * getAssetUrl('abc-123', { 
 *   bookmarkId: 'bm-456',
 *   url: 'https://github.com/example'
 * })
 * // Returns: '/api/assets/abc-123?bid=bm-456&url=https%3A%2F%2Fgithub.com%2Fexample'
 */
export function getAssetUrl(
  assetId: string | undefined | null,
  context?: {
    bookmarkId?: string;
    url?: string;
    domain?: string;
  }
): string | undefined {
  if (!assetId) return undefined;

  // Build query parameters for context if provided
  // URLSearchParams automatically handles encoding
  const params = new URLSearchParams();
  if (context?.bookmarkId) params.append("bid", context.bookmarkId);
  if (context?.url) params.append("url", context.url);
  if (context?.domain) params.append("domain", context.domain);

  // Always use API proxy to ensure correct content-type is preserved
  // This guarantees that images work regardless of their actual format (jpg, png, gif, webp, etc.)
  const queryString = params.toString();
  return queryString ? `/api/assets/${assetId}?${queryString}` : `/api/assets/${assetId}`;
}

/**
 * Selects the best available image for a bookmark based on priority order.
 *
 * Priority order (highest to lowest):
 * 1. Already persisted S3 CDN URLs (from ogImage) - Best performance
 * 2. Karakeep image asset (content.imageAssetId) - May be OpenGraph or favicon
 * 3. Karakeep screenshot asset (content.screenshotAssetId) - Reliable fallback
 * 4. Any other ogImage we might have fetched ourselves
 *
 * IMPORTANT: content.imageUrl is intentionally EXCLUDED as it's typically 
 * a low-quality logo/favicon unsuitable for preview cards.
 * 
 * The function automatically passes bookmark context to getAssetUrl() to enable
 * descriptive S3 filenames when assets are cached.
 *
 * @param bookmark - Bookmark object with image data
 * @param bookmark.ogImage - OpenGraph image URL (may be S3 or external)
 * @param bookmark.content - Karakeep content with asset IDs
 * @param bookmark.id - Bookmark ID for filename generation
 * @param bookmark.url - Bookmark URL for domain extraction
 * @param options - Configuration for image selection
 * @param options.includeScreenshots - Whether to use screenshots as fallback (default: true)
 * @param options.returnUndefined - Return undefined instead of null when no image (default: false)
 * @returns Selected image URL, null if none available (or undefined if returnUndefined=true)
 *
 * @example
 * ```typescript
 * // Default behavior - all fallbacks enabled
 * const imageUrl = selectBestImage(bookmark);
 *
 * // Exclude screenshots from fallback chain
 * const imageUrl = selectBestImage(bookmark, { includeScreenshots: false });
 * ```
 */
export function selectBestImage(
  bookmark: Pick<UnifiedBookmark, "ogImage" | "content" | "id" | "url">,
  options: ImageSelectionOptions = {},
): string | null | undefined {
  const { includeScreenshots = true, returnUndefined = false } = options;

  const { content } = bookmark;
  const noImageResult = returnUndefined ? undefined : null;
  const s3CdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL || process.env.S3_CDN_URL || "";

  // Prepare context for asset URL generation (for descriptive S3 filenames)
  let domain: string | undefined;
  try {
    domain = bookmark.url ? new URL(bookmark.url).hostname.replace(/^www\./, "") : undefined;
  } catch {
    domain = undefined;
  }
  
  const assetContext = {
    bookmarkId: bookmark.id,
    url: bookmark.url,
    domain,
  };

  // PRIORITY 1: Already persisted to our S3 (best performance)
  if (bookmark.ogImage && s3CdnUrl && bookmark.ogImage.includes(s3CdnUrl)) {
    return bookmark.ogImage;
  }

  // PRIORITY 2: Karakeep image asset (could be OpenGraph image OR favicon)
  // We can't know at runtime if it's a favicon without fetching it
  // The batch processor will validate sizes and use screenshot as fallback if needed
  if (content?.imageAssetId) {
    return getAssetUrl(content.imageAssetId, assetContext);
  }

  // PRIORITY 3: Karakeep screenshot asset (good quality fallback)
  if (includeScreenshots && content?.screenshotAssetId) {
    return getAssetUrl(content.screenshotAssetId, assetContext);
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
