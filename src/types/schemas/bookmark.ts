/**
 * Bookmark Schemas
 * @module types/schemas/bookmark
 * @description
 * Zod v4 schemas for bookmark data validation.
 * All bookmark Zod schemas live here; pure interfaces remain in types/bookmark.ts.
 */

import { z } from "zod/v4";
import { registryLinkSchema } from "./registry-link";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive / Shared Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Reusable URL schema (top-level Zod v4 form) */
const urlSchema = z.url();

/** Reusable nullable-optional string */
const stringOrNullSchema = z.string().nullable().optional();

// ─────────────────────────────────────────────────────────────────────────────
// Tag Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Bookmark Tag Schema - Single source of truth */
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

// ─────────────────────────────────────────────────────────────────────────────
// Asset Schema
// ─────────────────────────────────────────────────────────────────────────────

export const bookmarkAssetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
});

export type BookmarkAsset = z.infer<typeof bookmarkAssetSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Raw API Schemas (Hoarder/external API shapes)
// ─────────────────────────────────────────────────────────────────────────────

export const rawApiBookmarkTagSchema = bookmarkTagSchema
  .extend({
    attachedBy: z.string(),
  })
  .omit({ slug: true, color: true, count: true, assetType: true });

export type RawApiBookmarkTag = z.infer<typeof rawApiBookmarkTagSchema>;

/** Single content schema used everywhere */
export const bookmarkContentSchema = z.object({
  type: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable().optional(),
  imageAssetId: z.string().nullable().optional(),
  screenshotAssetId: z.string().nullable().optional(),
  favicon: z.string().nullable().optional(),
  htmlContent: z.string().nullable().optional(),
  crawledAt: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  datePublished: z.string().nullable().optional(),
  dateModified: z.string().nullable().optional(),
});

export type BookmarkContent = z.infer<typeof bookmarkContentSchema>;

export const rawApiBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  title: z.string().nullable(),
  archived: z.boolean(),
  favourited: z.boolean(),
  taggingStatus: z.string().optional(),
  summarizationStatus: z.string().optional(),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(rawApiBookmarkTagSchema),
  content: bookmarkContentSchema,
  assets: z.array(bookmarkAssetSchema).optional(),
});

export type RawApiBookmark = z.infer<typeof rawApiBookmarkSchema>;

export const bookmarksApiResponseSchema = z.object({
  bookmarks: z.array(rawApiBookmarkSchema),
  nextCursor: z.string().nullable(),
});

export type BookmarksApiResponse = z.infer<typeof bookmarksApiResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Logo Data Schema
// ─────────────────────────────────────────────────────────────────────────────

export const logoDataSchema = z.object({
  url: z.url(),
  alt: z.string().nullable().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// UnifiedBookmark Schema (most comprehensive bookmark type)
// ─────────────────────────────────────────────────────────────────────────────

export const unifiedBookmarkSchema = z.object({
  id: z.string(),
  url: z.url(),
  title: z.string().min(1),
  description: z.string(),
  slug: z.string().min(1),
  tags: z.union([z.array(bookmarkTagSchema), z.array(z.string())]),
  ogImage: z.url().optional(),
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
  /** Optional links to package registries where the bookmarked resource is distributed */
  registryLinks: z.array(registryLinkSchema).optional(),
});

export type UnifiedBookmark = z.infer<typeof unifiedBookmarkSchema>;

/** Array schema for validating bookmark collections */
export const unifiedBookmarksArraySchema = z.array(unifiedBookmarkSchema);

// ─────────────────────────────────────────────────────────────────────────────
// Base / Raw / Client Bookmark Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Base bookmark schema with common fields */
const baseBookmarkSchema = z.object({
  id: z.string(),
  url: urlSchema,
  title: z.string().min(1),
  description: stringOrNullSchema,
  slug: z.string().min(1),
  dateBookmarked: z.string(),
  dateCreated: z.string().optional(),
  dateUpdated: z.string().optional(),
  isPrivate: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  readingTime: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
});

/** Raw bookmark from APIs (tags as strings) */
export const rawBookmarkSchema = baseBookmarkSchema.extend({
  tags: z.array(z.string()).default([]),
  userId: z.string().optional(),
});

export type RawBookmark = z.infer<typeof rawBookmarkSchema>;

/** Client bookmark with enriched data */
export const clientBookmarkSchema = baseBookmarkSchema.extend({
  tags: z.array(bookmarkTagSchema).default([]),
  logoData: logoDataSchema.optional(),
  ogTitle: stringOrNullSchema,
  ogDescription: stringOrNullSchema,
  ogImage: z.union([urlSchema, z.string().nullable()]).optional(),
  domain: z.string().optional(),
});

export type ClientBookmark = z.infer<typeof clientBookmarkSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Pagination & List Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Index & Search Schemas
// ─────────────────────────────────────────────────────────────────────────────

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

export const bookmarksSearchResponseSchema = z.object({
  data: z.array(unifiedBookmarkSchema),
});

export type BookmarksSearchResponse = z.infer<typeof bookmarksSearchResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Slug Mapping Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const bookmarkSlugEntrySchema = z.object({
  id: z.string(),
  slug: z.string().min(1),
  url: z.url(),
  title: z.string(),
});

export type BookmarkSlugEntry = z.infer<typeof bookmarkSlugEntrySchema>;

export const bookmarkSlugMappingSchema = z.object({
  version: z.string(),
  generated: z.iso.datetime(),
  count: z.number().int().min(0),
  checksum: z.string().regex(/^[a-f0-9]{32}$/),
  slugs: z.record(z.string(), bookmarkSlugEntrySchema),
  reverseMap: z.record(z.string(), z.string()),
});

export type BookmarkSlugMapping = z.infer<typeof bookmarkSlugMappingSchema>;
