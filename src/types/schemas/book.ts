/**
 * Book Schemas
 * @module types/schemas/book
 * @description
 * Zod v4 schemas for book data validation.
 * Transform functions live in lib/schemas/book.ts
 */

import { z } from "zod/v4";
import { relatedContentTypeSchema } from "./related-content";

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

  // Cover
  coverUrl: z.url().optional(),
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
  coverUrl: z.url().optional(),
  /** Base64-encoded blur data URL for cover placeholder (LQIP) */
  coverBlurDataURL: z.string().optional(),
});

export type BookListItem = z.infer<typeof bookListItemSchema>;

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

export type AbsLibraryItem = z.infer<typeof absLibraryItemSchema>;

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

export const validateBookListItem = (data: unknown): BookListItem => bookListItemSchema.parse(data);

export const validateAbsLibraryItem = (data: unknown): AbsLibraryItem => absLibraryItemSchema.parse(data);

export const validateAbsLibraryItemsResponse = (data: unknown): AbsLibraryItemsResponse =>
  absLibraryItemsResponseSchema.parse(data);

// ─────────────────────────────────────────────────────────────────────────────
// API Options Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface AbsTransformOptions {
  baseUrl: string;
  apiKey: string;
}

/**
 * Supported sort fields for AudioBookShelf library items.
 * Uses JavaScript object notation as documented in the ABS API.
 * @see https://api.audiobookshelf.org/ - GET /api/libraries/{id}/items
 */
export type AbsSortField =
  | "addedAt"
  | "updatedAt"
  | "media.metadata.title"
  | "media.metadata.authorName"
  | "media.metadata.publishedYear"
  | "media.duration"
  | "size";

export interface FetchAbsLibraryItemsOptions {
  /** Field to sort by (default: "addedAt") */
  sort?: AbsSortField;
  /** Sort in descending order - newest/largest first (default: true) */
  desc?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Books Related Content S3 Data Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata for related content display (optional fields)
 */
export const relatedContentMetadataSchema = z
  .object({
    tags: z.array(z.string()).optional(),
    domain: z.string().optional(),
    date: z.string().optional(),
    imageUrl: z.string().optional(),
    readingTime: z.number().optional(),
    stage: z.string().optional(),
    category: z.string().optional(),
    aventureUrl: z.string().optional(),
    author: z
      .object({
        name: z.string(),
        avatar: z.string().optional(),
      })
      .optional(),
    authors: z.array(z.string()).optional(),
    formats: z.array(z.string()).optional(),
  })
  .optional();

/**
 * Pre-computed related content entry schema.
 * Validates data fetched from S3 for the books related content graph.
 */
export const relatedContentEntrySchema = z.object({
  type: relatedContentTypeSchema,
  id: z.string(),
  score: z.number(),
  title: z.string(),
  metadata: relatedContentMetadataSchema,
});

export type RelatedContentEntryFromSchema = z.infer<typeof relatedContentEntrySchema>;

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

export type BooksRelatedContentDataFromSchema = z.infer<typeof booksRelatedContentDataSchema>;
