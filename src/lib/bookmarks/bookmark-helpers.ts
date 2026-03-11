/**
 * Bookmark Helper Utilities
 *
 * Provides consistent URL construction and image selection for bookmarks.
 * Handles Karakeep/Hoarder asset URLs.
 *
 * @module lib/bookmarks/bookmark-helpers
 */

import type { UnifiedBookmark, BookmarkContent } from "@/types/schemas/bookmark";
import type { KarakeepImageFallback } from "@/types/opengraph";
import type { ImageSelectionOptions } from "@/types/features/bookmarks";
import { getCdnConfigFromEnv, isOurCdnUrl } from "@/lib/utils/cdn-utils";

/**
 * Constructs a consistent asset URL for Karakeep assets.
 *
 * Returns a canonical asset URL keyed by the upstream asset ID.
 *
 * @param assetId - The asset ID from Karakeep/Hoarder
 * @param context - Deprecated and ignored (kept for call-site compatibility)
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
 * // Returns: '/api/assets/abc-123'
 */
export function getAssetUrl(
  assetId: string | undefined | null,
  context?: {
    bookmarkId?: string;
    url?: string;
    domain?: string;
  },
): string | undefined {
  if (!assetId) return undefined;

  void context;
  return `/api/assets/${assetId}`;
}

/**
 * Selects the best available image for a bookmark based on priority order.
 *
 * Priority order (highest to lowest):
 * 1. Already persisted S3 CDN URLs (from ogImage) - Best performance
 * 2. Karakeep screenshot asset (content.screenshotAssetId) when preferScreenshots=true
 * 3. Karakeep image asset (content.imageAssetId) when includeImageAssets=true
 * 4. Karakeep screenshot asset (content.screenshotAssetId) fallback
 * 5. Any other ogImage we might have fetched ourselves
 *
 * IMPORTANT: content.imageUrl is intentionally EXCLUDED as it's typically
 * a low-quality logo/favicon unsuitable for preview cards.
 *
 * The function passes bookmark context to getAssetUrl() for compatibility only.
 *
 * @param bookmark - Bookmark object with image data
 * @param bookmark.ogImage - OpenGraph image URL (may be S3 or external)
 * @param bookmark.content - Karakeep content with asset IDs
 * @param bookmark.id - Bookmark ID for filename generation
 * @param bookmark.url - Bookmark URL for domain extraction
 * @param options - Configuration for image selection
 * @param options.includeScreenshots - Whether to use screenshots as fallback (default: true)
 * @param options.includeImageAssets - Whether imageAssetId is eligible (default: true)
 * @param options.preferScreenshots - Prioritize screenshotAssetId before imageAssetId (default: false)
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
  const {
    includeScreenshots = true,
    includeImageAssets = true,
    preferScreenshots = false,
    returnUndefined = false,
  } = options;

  const { content } = bookmark;
  const noImageResult = returnUndefined ? undefined : null;
  const cdnConfig = getCdnConfigFromEnv();

  // PRIORITY 1: Already persisted to our S3 (best performance)
  if (bookmark.ogImage && isOurCdnUrl(bookmark.ogImage, cdnConfig)) {
    return bookmark.ogImage;
  }

  // Optional strict mode: prefer screenshot assets before image assets.
  if (preferScreenshots && includeScreenshots && content?.screenshotAssetId) {
    return getAssetUrl(content.screenshotAssetId);
  }

  // PRIORITY 2: Karakeep image asset (could be OpenGraph image OR favicon)
  // We can't know at runtime if it's a favicon without fetching it.
  if (includeImageAssets && content?.imageAssetId) {
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
    screenshotAssetId:
      typeof content.screenshotAssetId === "string" ? content.screenshotAssetId : null,
    karakeepBaseUrl: baseUrl,
    idempotencyKey: idempotencyKey || undefined,
  };
}
