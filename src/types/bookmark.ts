/** Bookmarks API Types */

import type { ExtendedError } from "./error";

// ─────────────────────────────────────────────────────────────────────────────
// Re-export all schemas and schema-inferred types from the canonical source
// ─────────────────────────────────────────────────────────────────────────────
export {
  bookmarkTagSchema,
  type BookmarkTag,
  bookmarkAssetSchema,
  type BookmarkAsset,
  rawApiBookmarkTagSchema,
  type RawApiBookmarkTag,
  bookmarkContentSchema,
  type BookmarkContent,
  rawApiBookmarkSchema,
  type RawApiBookmark,
  bookmarksApiResponseSchema,
  type BookmarksApiResponse,
  logoDataSchema,
  unifiedBookmarkSchema,
  type UnifiedBookmark,
  unifiedBookmarksArraySchema,
  rawBookmarkSchema,
  type RawBookmark,
  clientBookmarkSchema,
  type ClientBookmark,
  bookmarkPaginationSchema,
  type BookmarkPagination,
  bookmarkListResponseSchema,
  type BookmarkListResponse,
  bookmarksIndexSchema,
  type BookmarksIndex,
  bookmarksSearchResponseSchema,
  type BookmarksSearchResponse,
  bookmarkSlugEntrySchema,
  type BookmarkSlugEntry,
  bookmarkSlugMappingSchema,
} from "./schemas/bookmark";

export { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";

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
export interface BookmarkS3Record extends Record<string, unknown> {
  id?: string;
  slug?: string;
  tags?: unknown;
}

/**
 * Extracted markdown content from a bookmark
 */
export interface ExtractedContent {
  markdown: string;
  wordCount: number;
  readingTime: number; // in minutes
  extractedAt: string;
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
  "ogImage" | "logoData"
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

export interface BookmarkLoadOptions {
  includeImageData?: boolean;
  skipExternalFetch?: boolean;
  force?: boolean;
}

/**
 * Mapping of bookmark IDs to pre-computed slugs for static generation
 */
export interface BookmarkSlugMapping {
  version: string;
  generated: string;
  count: number;
  checksum: string; // MD5 hash of slugs for concurrent write protection
  slugs: Readonly<
    Record<
      string,
      {
        id: string;
        slug: string;
        url: string;
        title: string;
      }
    >
  >;
  reverseMap: Readonly<Record<string, string>>; // slug -> id for quick lookup
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
  latestKey: string;
  envSuffix: string;
}
