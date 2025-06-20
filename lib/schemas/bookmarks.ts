/**
 * Bookmark Data Validation Schemas
 * @module lib/schemas/bookmarks
 * @description
 * Zod schemas for bookmark data validation and server-to-client serialization.
 * Ensures type safety across component boundaries and external API responses.
 */

import { z } from "zod";
import type {
  ValidatedBookmarkListResponse,
  ValidatedClientBookmark,
  ValidatedRawBookmark,
} from "@/types/features/bookmarks";

// Base validation schemas
const urlSchema = z.string().url();
const dateStringSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)); // ISO or similar
const stringOrNullSchema = z.string().nullable().optional();

/**
 * Schema for bookmark tags
 */
export const bookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  color: z.string().optional(),
  count: z.number().int().min(0).optional(),
});

/**
 * Schema for logo data in bookmarks
 */
export const logoDataSchema = z
  .object({
    src: urlSchema,
    alt: z.string().default("Logo"),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .nullable()
  .optional();

/**
 * Schema for raw bookmark data from external APIs
 * More permissive for handling various API responses
 */
export const rawBookmarkSchema = z.object({
  id: z.string(),
  url: urlSchema,
  title: z.string().min(1),
  description: stringOrNullSchema,
  tags: z.array(z.string()).default([]),
  dateBookmarked: dateStringSchema,
  dateCreated: dateStringSchema.optional(),
  dateUpdated: dateStringSchema.optional(),
  userId: z.string().optional(),
  isPrivate: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  readingTime: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
});

/**
 * Schema for client-side bookmark props (serializable only)
 * Used for server-to-client component communication
 */
export const clientBookmarkSchema = z.object({
  id: z.string(),
  url: urlSchema,
  title: z.string().min(1),
  description: stringOrNullSchema,
  tags: z.array(bookmarkTagSchema).default([]),
  dateBookmarked: z.string(), // Serialized date string
  dateCreated: z.string().optional(),
  dateUpdated: z.string().optional(),
  logoData: logoDataSchema,
  isPrivate: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
  readingTime: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0).optional(),
  // OpenGraph data (optional, from validated schemas)
  ogTitle: stringOrNullSchema,
  ogDescription: stringOrNullSchema,
  ogImage: urlSchema.or(stringOrNullSchema),
  domain: z.string().optional(),
});

/**
 * Schema for bookmark pagination metadata
 */
export const bookmarkPaginationSchema = z.object({
  currentPage: z.number().int().min(1),
  totalPages: z.number().int().min(0),
  totalCount: z.number().int().min(0),
  pageSize: z.number().int().min(1),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

/**
 * Schema for bookmark list API response
 */
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

/**
 * Utility function to safely parse bookmark API responses
 * @param data - Raw data from bookmark API
 * @returns Validated bookmarks or null if invalid
 */
export function parseBookmarkListResponse(data: unknown): ValidatedBookmarkListResponse | null {
  const result = bookmarkListResponseSchema.safeParse(data);
  if (!result.success) {
    console.warn("Bookmark list response validation failed:", result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Utility function to transform raw bookmark to client-safe format
 * @param rawBookmark - Raw bookmark from API
 * @returns Client-safe bookmark
 */
export function transformToClientBookmark(rawBookmark: ValidatedRawBookmark): ValidatedClientBookmark {
  return {
    ...rawBookmark,
    tags: [], // Will be populated separately with tag data
    logoData: null, // Will be populated separately with logo data
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    domain: extractDomain(rawBookmark.url),
  };
}

/**
 * Utility function to safely parse a single raw bookmark
 * @param data - Raw bookmark data
 * @returns Validated bookmark or null if invalid
 */
export function parseRawBookmark(data: unknown): ValidatedRawBookmark | null {
  const result = rawBookmarkSchema.safeParse(data);
  if (!result.success) {
    console.warn("Raw bookmark validation failed:", result.error.message);
    return null;
  }
  return result.data;
}

/**
 * Extract domain from URL for display purposes
 * @param url - Full URL
 * @returns Domain string or the URL if extraction fails
 */
function extractDomain(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
