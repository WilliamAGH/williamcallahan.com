/**
 * Search Schemas
 * @module types/schemas/search
 * @description
 * Zod v4 schemas for search-related data validation.
 * All search types should be defined here as schemas with z.infer<> exports.
 */

import { z } from "zod/v4";

// ─────────────────────────────────────────────────────────────────────────────
// Search Scopes
// ─────────────────────────────────────────────────────────────────────────────

/** Valid search scopes for index-specific searches */
export const validScopesSchema = z.enum([
  "blog",
  "posts",
  "investments",
  "experience",
  "education",
  "bookmarks",
  "projects",
  "books",
  "thoughts",
  "tags",
  "analysis",
]);

export const VALID_SCOPES = validScopesSchema.options;

/** Extended search scope including "all" for cross-index searches */
export const searchScopeSchema = z.enum([
  "all",
  "blog",
  "posts",
  "investments",
  "experience",
  "education",
  "bookmarks",
  "projects",
  "books",
  "thoughts",
  "tags",
  "analysis",
]);

export type SearchScope = z.infer<typeof searchScopeSchema>;

/** Search result type discriminator */
export const searchResultTypeSchema = z.enum(["bookmark", "blog-post", "project", "page", "tag"]);

export type SearchResultType = z.infer<typeof searchResultTypeSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Search API Params
// ─────────────────────────────────────────────────────────────────────────────

/** Pagination and query parameters for bookmark search API */
export const bookmarkSearchParamsSchema = z.object({
  q: z.string().min(1).max(100),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
});

export type BookmarkSearchParams = z.infer<typeof bookmarkSearchParamsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Index Input Types (for building search indexes)
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal bookmark shape for search indexing (distinct from full RawBookmark) */
export const bookmarkIndexInputSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  description: z.string(),
  summary: z.string().nullable().optional(),
  slug: z.string().optional(),
  tags: z.array(z.union([z.string(), z.object({ name: z.string().optional() })])).optional(),
  content: z
    .object({
      author: z.string().nullable().optional(),
      publisher: z.string().nullable().optional(),
    })
    .optional(),
});

export type BookmarkIndexInput = z.infer<typeof bookmarkIndexInputSchema>;

/** Education item for search indexing */
export const educationItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  path: z.string(),
});

export type EducationItem = z.infer<typeof educationItemSchema>;

/** Bookmark index item (processed for MiniSearch) */
export const bookmarkIndexItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  summary: z.string(),
  tags: z.string(),
  url: z.string(),
  author: z.string(),
  publisher: z.string(),
  slug: z.string(), // REQUIRED for idempotent routing
});

export type BookmarkIndexItem = z.infer<typeof bookmarkIndexItemSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Serialized Index Types (for S3 persistence)
// ─────────────────────────────────────────────────────────────────────────────

/** Serialized MiniSearch index with metadata */
export const serializedIndexSchema = z.object({
  index: z.union([z.string(), z.record(z.string(), z.unknown())]), // MiniSearch serialized JSON format
  metadata: z.object({
    itemCount: z.number(),
    buildTime: z.string(),
    version: z.string(),
  }),
});

export type SerializedIndex = z.infer<typeof serializedIndexSchema>;

/** All serialized indexes for S3 storage */
export const allSerializedIndexesSchema = z.object({
  posts: serializedIndexSchema,
  investments: serializedIndexSchema,
  experience: serializedIndexSchema,
  education: serializedIndexSchema,
  projects: serializedIndexSchema,
  bookmarks: serializedIndexSchema,
  books: serializedIndexSchema,
  buildMetadata: z.object({
    buildTime: z.string(),
    version: z.string(),
    environment: z.string(),
  }),
});

export type AllSerializedIndexes = z.infer<typeof allSerializedIndexesSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Tag Types
// ─────────────────────────────────────────────────────────────────────────────

/** Content types that support tags */
export const tagContentTypeSchema = z.enum(["blog", "bookmarks", "projects", "books"]);

export type TagContentType = z.infer<typeof tagContentTypeSchema>;

/** Aggregated tag with metadata for tag sub-index search */
export const aggregatedTagSchema = z.object({
  name: z.string(),
  slug: z.string(),
  contentType: tagContentTypeSchema,
  count: z.number(),
  url: z.string(),
});

export type AggregatedTag = z.infer<typeof aggregatedTagSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Search Result Types
// ─────────────────────────────────────────────────────────────────────────────

/** Individual search result schema */
export const searchResultSchema = z.object({
  id: z.string().min(1, "Search result ID cannot be empty"),
  type: searchResultTypeSchema,
  title: z.string(),
  description: z.string().optional(),
  url: z.string(),
  score: z.number(),
  highlights: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchResultsSchema = z.array(searchResultSchema);

export type SearchResults = z.infer<typeof searchResultsSchema>;

/**
 * Search result with relevance score wrapper.
 * Generic type cannot be expressed as Zod schema.
 */
export type ScoredResult<T> = { item: T; score: number };

// ─────────────────────────────────────────────────────────────────────────────
// MiniSearch Internal Types
// ─────────────────────────────────────────────────────────────────────────────

/** MiniSearch stored fields shape for index deserialization */
export const miniSearchStoredFieldsSchema = z.object({
  id: z.unknown().optional(),
  title: z.unknown().optional(),
  description: z.unknown().optional(),
  url: z.unknown().optional(),
  slug: z.unknown().optional(),
});

export type MiniSearchStoredFields = z.infer<typeof miniSearchStoredFieldsSchema>;
