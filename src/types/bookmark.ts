/** Bookmarks API Types */

import type { ExtendedError } from "./error";

// ─────────────────────────────────────────────────────────────────────────────
// Pure Interfaces (no Zod dependency)
// ─────────────────────────────────────────────────────────────────────────────

export interface BookmarkError extends ExtendedError {
  lastFetched?: number;
  lastFetchedTimestamp?: number;
}

/**
 * Minimal bookmark record structure used by scripts that manipulate the JSON payload
 * written to S3/CDN. Kept intentionally loose to avoid assumptions about enrichment.
 */
export interface BookmarkS3Entry extends Record<string, unknown> {
  id?: string;
  slug?: string;
  tags?: unknown;
}

export type BookmarksResponse = import("./lib").PaginatedResponse<
  import("./schemas/bookmark").UnifiedBookmark
>;

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
  slug: string; // Explicitly include slug as required
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

/** Union returned by bookmark loaders depending on includeImageData mode. */
export type AnyBookmark = import("./schemas/bookmark").UnifiedBookmark | LightweightBookmark;

export interface BookmarkLoadOptions {
  includeImageData?: boolean;
  skipExternalFetch?: boolean;
  force?: boolean;
}

// BookmarkSlugMapping is now derived from bookmarkSlugMappingSchema via z.infer<>
// and re-exported from ./schemas/bookmark above.

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
