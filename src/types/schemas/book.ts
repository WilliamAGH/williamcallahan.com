/**
 * Book Schemas
 * @module types/schemas/book
 * @description
 * Zod v4 schemas for book data validation.
 * Transform functions live in lib/schemas/book.ts
 */

import { z } from "zod/v4";
import { relatedContentEntrySchema } from "./related-content";

const absoluteOrRootRelativeUrlSchema = z.union([
  z.url(),
  z.string().regex(/^\/(?!\/).+/, "Must be an absolute URL or a root-relative path"),
]);

// ─────────────────────────────────────────────────────────────────────────────
// EPUB Metadata Schema (for parsing validation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Schema for validating EPUB metadata extracted from user-uploaded files.
 * Matches the EpubMetadata interface in types/books/parsing.ts.
 *
 * This validates data at the IO boundary - EPUB files are external untrusted
 * input that should be validated after parsing to catch malformed metadata.
 */
export const epubMetadataSchema = z.object({
  // Core Dublin Core metadata
  title: z.string(),
  author: z.string(),
  authorFileAs: z.string().optional(),
  publisher: z.string().optional(),
  language: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  subjects: z.array(z.string()).optional(),

  // Identifiers
  isbn: z.string().optional(),
  uuid: z.string().optional(),

  // Series information
  series: z.string().optional(),
  seriesIndex: z.number().optional(),

  // Additional metadata
  rights: z.string().optional(),
  contributors: z.array(z.string()).optional(),
  coverId: z.string().optional(),

  // Raw metadata for debugging/extension
  rawMetadata: z.record(z.string(), z.unknown()).optional(),
});

export type EpubMetadata = z.infer<typeof epubMetadataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Core Book Schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Book format options */
export const bookFormatSchema = z.enum(["ebook", "audio", "print"]);

export type BookFormat = z.infer<typeof bookFormatSchema>;

/**
 * Core book schema - immutable metadata
 * Only id and title are required; all else optional.
 */
export const bookSchema = z.object({
  // Required
  id: z.string(),
  title: z.string(),

  // Identifiers
  isbn10: z.string().optional(),
  isbn13: z.string().optional(),
  asin: z.string().optional(),

  // Core info
  subtitle: z.string().optional(),
  authors: z.array(z.string()).optional(),
  publisher: z.string().optional(),
  publishedYear: z.string().optional(),
  genres: z.array(z.string()).optional(),
  description: z.string().optional(),

  // Format
  formats: z.array(bookFormatSchema).default(["ebook"]),

  // Audio-specific
  audioNarrators: z.array(z.string()).optional(),
  audioDurationSeconds: z.number().optional(),
  audioChapterCount: z.number().optional(),

  // Cover URL may be absolute or root-relative proxy path (/api/cache/images?...).
  coverUrl: absoluteOrRootRelativeUrlSchema.optional(),
  /** Base64-encoded blur data URL for cover placeholder (LQIP) */
  coverBlurDataURL: z.string().optional(),

  // External links
  findMyBookUrl: z.url().optional(),
  publisherUrl: z.url().optional(),
  amazonUrl: z.url().optional(),
  audibleUrl: z.url().optional(),
  bookshopUrl: z.url().optional(),

  // Personal annotations
  aiSummary: z.string().optional(),
  thoughts: z.string().optional(),
});

export type Book = z.infer<typeof bookSchema>;

/**
 * List item schema - minimal for grids/cards
 */
export const bookListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  authors: z.array(z.string()).optional(),
  coverUrl: absoluteOrRootRelativeUrlSchema.optional(),
  /** Base64-encoded blur data URL for cover placeholder (LQIP) */
  coverBlurDataURL: z.string().optional(),
});

export type BookBrief = z.infer<typeof bookListItemSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// AudioBookShelf API Response Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AudioBookShelf library item metadata (nested under media.metadata)
 */
const absMetadataSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullish(),
  authors: z.array(z.object({ name: z.string() })).optional(),
  authorName: z.string().nullish(), // Fallback when authors array is empty
  narrators: z.array(z.object({ name: z.string() })).optional(),
  publisher: z.string().nullish(),
  publishedYear: z.string().nullish(),
  genres: z.array(z.string()).optional(),
  description: z.string().nullish(),
  isbn: z.string().nullish(),
  asin: z.string().nullish(),
});

/**
 * AudioBookShelf library item response schema
 * Matches /api/libraries/{id}/items and /api/items/{id} responses
 */
export const absLibraryItemSchema = z.object({
  id: z.string(),
  mediaType: z.string(),
  media: z.object({
    metadata: absMetadataSchema,
    duration: z.number().optional(),
    chapters: z.array(z.object({ id: z.number() })).optional(),
    ebookFormat: z.string().nullish(), // e.g., "epub", "pdf" - present if ebook exists
  }),
});

export type AbsLibraryEntry = z.infer<typeof absLibraryItemSchema>;

/**
 * AudioBookShelf library items list response
 */
export const absLibraryItemsResponseSchema = z.object({
  results: z.array(absLibraryItemSchema),
  total: z.number(),
  limit: z.number(),
  page: z.number(),
});

export type AbsLibraryItemsResponse = z.infer<typeof absLibraryItemsResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────────────────────────────────────

export const validateBook = (data: unknown): Book => bookSchema.parse(data);

export const validateBookBrief = (data: unknown): BookBrief => bookListItemSchema.parse(data);

export const validateAbsLibraryEntry = (data: unknown): AbsLibraryEntry =>
  absLibraryItemSchema.parse(data);

export const validateAbsLibraryItemsResponse = (data: unknown): AbsLibraryItemsResponse =>
  absLibraryItemsResponseSchema.parse(data);

// ─────────────────────────────────────────────────────────────────────────────
// API Options Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export const absTransformOptionsSchema = z.object({
  baseUrl: z.string(),
  apiKey: z.string(),
});
export type AbsTransformOptions = z.infer<typeof absTransformOptionsSchema>;

/**
 * Supported sort fields for AudioBookShelf library items.
 * Uses JavaScript object notation as documented in the ABS API.
 * @see https://api.audiobookshelf.org/ - GET /api/libraries/{id}/items
 */
export const absSortFieldSchema = z.enum([
  "addedAt",
  "updatedAt",
  "media.metadata.title",
  "media.metadata.authorName",
  "media.metadata.publishedYear",
  "media.duration",
  "size",
]);
export type AbsSortField = z.infer<typeof absSortFieldSchema>;

export const fetchAbsLibraryItemsOptionsSchema = z.object({
  /** Field to sort by (default: "addedAt") */
  sort: absSortFieldSchema.optional(),
  /** Sort in descending order - newest/largest first (default: true) */
  desc: z.boolean().optional(),
});
export type FetchAbsLibraryItemsOptions = z.infer<typeof fetchAbsLibraryItemsOptionsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Books Related Content S3 Data Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const relatedContentGraphSchema = z.record(z.string(), z.array(relatedContentEntrySchema));

export type RelatedContentGraph = z.infer<typeof relatedContentGraphSchema>;

/**
 * Books related content data schema.
 * Validates the full JSON structure fetched from S3.
 */
export const booksRelatedContentDataSchema = z.object({
  version: z.string(),
  generated: z.string(),
  booksCount: z.number(),
  entries: z.record(z.string(), z.array(relatedContentEntrySchema)),
});

export type BooksRelatedContent = z.infer<typeof booksRelatedContentDataSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Book Enrichment & Consolidated Dataset Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-book manual enrichment entry.
 * Keyed by AudioBookShelf item ID in data/book-enrichments.ts.
 * Merged with ABS API data during generation (scripts/generate-books.ts).
 */
export const bookEnrichmentEntrySchema = z.object({
  findMyBookUrl: z.url().optional(),
  publisherUrl: z.url().optional(),
  amazonUrl: z.url().optional(),
  audibleUrl: z.url().optional(),
  bookshopUrl: z.url().optional(),
  aiSummary: z.string().optional(),
  thoughts: z.string().optional(),
});

export type BookEnrichmentEntry = z.infer<typeof bookEnrichmentEntrySchema>;

/**
 * Book registry entry — enrichment data plus human-readable identifiers.
 * The `slug` field is for reference only (not merged into Book); the record
 * key is the canonical ABS item ID used for matching.
 */
export const bookRegistryEntrySchema = bookEnrichmentEntrySchema.extend({
  slug: z.string(),
});

export type BookRegistryEntry = z.infer<typeof bookRegistryEntrySchema>;

/**
 * Consolidated books dataset persisted to S3 by scripts/generate-books.ts.
 * Contains the full Book[] array with all ABS fields + enrichment fields merged.
 */
export const booksDatasetSchema = z.object({
  version: z.string(),
  generated: z.string(),
  booksCount: z.number(),
  checksum: z.string(),
  books: z.array(bookSchema),
});

export type BooksDataset = z.infer<typeof booksDatasetSchema>;

/**
 * Latest pointer — points to the current versioned snapshot in S3.
 * Written to json/books-{env}/latest.json.
 */
export const booksLatestSchema = z.object({
  checksum: z.string(),
  key: z.string(),
  generated: z.string(),
});

export type BooksLatest = z.infer<typeof booksLatestSchema>;
