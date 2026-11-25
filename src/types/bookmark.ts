/** Bookmarks API Types */

// ─────────────────────────────────────────────────────────────────────────────
// Pure Interfaces (no Zod dependency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight bookmark type that excludes heavy image data for performance in lists.
 *
 * This type preserves essential fields needed for UI rendering while omitting large
 * image assets. The content object specifically preserves metadata fields like
 * screenshotAssetId (for fallback images), favicon, author, publisher, and dates.
 *
 * Used throughout the application when rendering bookmark lists to minimize data transfer.
 * Conversion to/from UnifiedBookmark should use standardized utilities in '@/lib/bookmarks/utils'.
 */
export type LightweightBookmark = Omit<
  import("./schemas/bookmark").UnifiedBookmark,
  "ogImage" | "logoData" | "scrapedContentText"
> & {
  content?: Pick<
    import("./schemas/bookmark").BookmarkContent,
    | "type"
    | "url"
    | "title"
    | "description"
    | "screenshotAssetId"
    | "favicon"
    | "author"
    | "publisher"
    | "datePublished"
    | "dateModified"
  >;
};

export interface BookmarkLoadOptions {
  includeImageData?: boolean;
  skipExternalFetch?: boolean;
  force?: boolean;
}

/** Validated API configuration for bookmark fetching */
export interface BookmarksApiContext {
  apiUrl: string;
  requestHeaders: { Accept: string; Authorization: string };
}

/** Result of checksum validation - either cached data or null to proceed */
export interface ChecksumResult {
  cached: import("./schemas/bookmark").UnifiedBookmark[] | null;
  checksum: string;
}
