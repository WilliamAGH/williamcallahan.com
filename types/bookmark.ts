import { z } from "zod";
import type { ExtendedError } from "./error";

/** Bookmarks API Types */

// Bookmark Tag Schema - Single source of truth
export const bookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  color: z.string().optional(),
  count: z.number().int().min(0).optional(),
  attachedBy: z.enum(["ai", "user"]).optional(),
  assetType: z.string().optional(),
});

export type BookmarkTag = z.infer<typeof bookmarkTagSchema>;

export type ContentType = "link" | "image" | "video" | (string & {});

export const bookmarkAssetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
});

export type BookmarkAsset = z.infer<typeof bookmarkAssetSchema>;

export interface BookmarkError extends ExtendedError {
  lastFetched?: number;
  lastFetchedTimestamp?: number;
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

// Use a single tag schema with optional fields
export const rawApiBookmarkTagSchema = bookmarkTagSchema
  .extend({
    attachedBy: z.string(),
  })
  .omit({ slug: true, color: true, count: true, assetType: true });

export type RawApiBookmarkTag = z.infer<typeof rawApiBookmarkTagSchema>;

// Single content schema used everywhere
export const bookmarkContentSchema = z.object({
  type: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().optional(),
  screenshotAssetId: z.string().optional(),
  favicon: z.string().optional(),
  htmlContent: z.string().optional(),
  crawledAt: z.string().optional(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  datePublished: z.string().nullable().optional(),
  dateModified: z.string().nullable().optional(),
});

export type BookmarkContent = z.infer<typeof bookmarkContentSchema>;

// Alias for backward compatibility
export const rawApiBookmarkContentSchema = bookmarkContentSchema;
export type RawApiBookmarkContent = BookmarkContent;

export const rawApiBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  title: z.string().nullable(),
  archived: z.boolean(),
  favourited: z.boolean(),
  taggingStatus: z.string(),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(rawApiBookmarkTagSchema),
  content: bookmarkContentSchema,
  assets: z.array(bookmarkAssetSchema),
});

export type RawApiBookmark = z.infer<typeof rawApiBookmarkSchema>;

export const bookmarksApiResponseSchema = z.object({
  bookmarks: z.array(rawApiBookmarkSchema),
  nextCursor: z.string().nullable(),
});

export type BookmarksApiResponse = z.infer<typeof bookmarksApiResponseSchema>;

// Shared validation schemas
const urlSchema = z.string().url();
const stringOrNullSchema = z.string().nullable().optional();

// Logo data schema for validating logo data objects
export const logoDataSchema = z.object({
  url: z.string().url(),
  alt: z.string().nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// UnifiedBookmark schema - provides runtime validation for the most comprehensive bookmark type
export const unifiedBookmarkSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string().min(1),
  description: z.string(),
  tags: z.union([z.array(bookmarkTagSchema), z.array(z.string())]),
  ogImage: z.string().url().optional(),
  dateBookmarked: z.string(),
  datePublished: z.string().nullable().optional(),
  dateCreated: z.string().optional(),
  dateUpdated: z.string().optional(),
  modifiedAt: z.string().optional(),
  archived: z.boolean().optional(),
  taggingStatus: z.string().optional(),
  note: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  content: bookmarkContentSchema.optional(),
  assets: z.array(bookmarkAssetSchema).optional(),
  logoData: logoDataSchema.nullable().optional(),
  readingTime: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
  ogTitle: z.string().nullable().optional(),
  ogDescription: z.string().nullable().optional(),
  ogUrl: z.string().nullable().optional(),
  domain: z.string().optional(),
  sourceUpdatedAt: z.string(),
  ogImageLastFetchedAt: z.string().optional(),
  ogImageEtag: z.string().optional(),
  isPrivate: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  ogImageExternal: z.string().optional(),
});

export type UnifiedBookmark = z.infer<typeof unifiedBookmarkSchema>;

// Base bookmark schema with common fields
const baseBookmarkSchema = z.object({
  id: z.string(),
  url: urlSchema,
  title: z.string().min(1),
  description: stringOrNullSchema,
  dateBookmarked: z.string(),
  dateCreated: z.string().optional(),
  dateUpdated: z.string().optional(),
  isPrivate: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  readingTime: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
});

// Raw bookmark from APIs (tags as strings)
export const rawBookmarkSchema = baseBookmarkSchema.extend({
  tags: z.array(z.string()).default([]),
  userId: z.string().optional(),
});

export type RawBookmark = z.infer<typeof rawBookmarkSchema>;

// Client bookmark with enriched data
export const clientBookmarkSchema = baseBookmarkSchema.extend({
  tags: z.array(bookmarkTagSchema).default([]),
  logoData: logoDataSchema.optional(),
  // OpenGraph data (optional, from validated schemas)
  ogTitle: stringOrNullSchema,
  ogDescription: stringOrNullSchema,
  ogImage: z.union([urlSchema, z.string().nullable()]).optional(),
  domain: z.string().optional(),
});

export type ClientBookmark = z.infer<typeof clientBookmarkSchema>;

export const bookmarkPaginationSchema = z.object({
  currentPage: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  pageSize: z.number().int().min(1),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export type BookmarkPagination = z.infer<typeof bookmarkPaginationSchema>;

export const bookmarkListResponseSchema = z.object({
  bookmarks: z.array(rawBookmarkSchema),
  pagination: bookmarkPaginationSchema.optional(),
  metadata: z
    .object({
      totalCount: z.number().int().min(0),
      lastFetchedAt: z.number().int(),
      cacheKey: z.string().optional(),
    })
    .optional(),
});

export type BookmarkListResponse = z.infer<typeof bookmarkListResponseSchema>;

export const bookmarksIndexSchema = z.object({
  count: z.number().int().min(0),
  totalPages: z.number().int().min(0),
  pageSize: z.number().int().min(1).default(24),
  lastModified: z.string(),
  lastFetchedAt: z.number().int(),
  lastAttemptedAt: z.number().int(),
  checksum: z.string(),
  changeDetected: z.boolean().optional(),
});

export type BookmarksIndex = z.infer<typeof bookmarksIndexSchema>;

export type BookmarksResponse = import("./lib").PaginatedResponse<UnifiedBookmark>;

// Search API response schema
export const bookmarksSearchResponseSchema = z.object({
  data: z.array(unifiedBookmarkSchema),
});

export type BookmarksSearchResponse = z.infer<typeof bookmarksSearchResponseSchema>;

// Additional Zod schemas moved from lib/validators/bookmarks.ts
export const BookmarkAssetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
});

export const RawApiBookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachedBy: z.string(),
});

export const RawApiBookmarkContentSchema = z.object({
  type: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().optional(),
  screenshotAssetId: z.string().optional(),
  favicon: z.string().optional(),
  htmlContent: z.string().optional(),
  crawledAt: z.string().optional(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  datePublished: z.string().nullable().optional(),
  dateModified: z.string().nullable().optional(),
});

export const RawApiBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  title: z.string().nullable(),
  archived: z.boolean(),
  favourited: z.boolean(),
  taggingStatus: z.string(),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(RawApiBookmarkTagSchema),
  content: RawApiBookmarkContentSchema,
  assets: z.array(BookmarkAssetSchema),
});

export const BookmarksApiResponseSchema = z.object({
  bookmarks: z.array(RawApiBookmarkSchema),
  nextCursor: z.string().nullable(),
});

export { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";

// Lightweight bookmark type that excludes heavy image data
export type LightweightBookmark = Omit<UnifiedBookmark, "content" | "ogImage" | "logoData">;

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

export type BookmarkSlugEntry = {
  id: string;
  slug: string;
  url: string;
  title: string;
};

export const bookmarkSlugMappingSchema = z.object({
  version: z.string(),
  generated: z.string(), // ISO8601 timestamp expected
  count: z.number().int().min(0),
  slugs: z.record(
    z.object({
      id: z.string(),
      slug: z.string(),
      url: z.string().url(),
      title: z.string(),
    }),
  ),
  reverseMap: z.record(z.string()),
});
