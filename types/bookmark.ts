import type { JSX } from "react";
import { z } from "zod";

/**
 * Bookmarks API Types
 *
 * Types for the bookmarks API with Zod validation schemas
 *
 * @module types/bookmark
 */

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description: string;
  tags: string[];
  ogImage?: string;
  dateBookmarked: string;
  datePublished?: string;
  telegramUsername?: string;
}

export interface BookmarkWithPreview extends Bookmark {
  preview: JSX.Element;
}

// Added unified bookmark types
export interface BookmarkTag {
  /** Optional ID from API */
  id?: string;
  /** Tag name */
  name: string;
  /** Source of tagging (ai or user) */
  attachedBy?: "ai" | "user";
}

// Define known content types with a catch-all fallback
export type ContentType = "link" | "image" | "video" | (string & {});

export interface BookmarkContent {
  /** Content type (e.g., link | image | video) */
  type: ContentType;
  /** URL of the content */
  url: string;
  /** Resolved title */
  title: string;
  /** Resolved description */
  description: string;
  /** Optional OG image URL */
  imageUrl?: string;
  /** Optional favicon URL */
  favicon?: string;
  /** Raw HTML if available */
  htmlContent?: string;
  /** Crawl timestamp */
  crawledAt?: string;
  /** Optional author */
  author?: string | null;
  /** Optional publisher */
  publisher?: string | null;
  /** Published date */
  datePublished?: string | null;
  /** Modified date */
  dateModified?: string | null;
  /** Asset IDs for images */
  imageAssetId?: string;
  screenshotAssetId?: string;
}

export interface BookmarkAsset {
  /** Asset ID */
  id: string;
  /** Type of asset (screenshot or bannerImage) */
  assetType: string;
}

// Zod Validation Schemas
export const BookmarkAssetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
});

export interface UnifiedBookmark {
  /** Globally unique bookmark ID */
  id: string;
  /** Canonical URL */
  url: string;
  /** Primary title */
  title: string;
  /** Primary description */
  description: string;
  /** Tags can be either strings or fully typed Tag objects */
  tags: BookmarkTag[] | string[];
  /** Optional fallback image */
  ogImage?: string;
  /** When the bookmark was created */
  dateBookmarked: string;
  /** When the content was originally published */
  datePublished?: string | null;
  /** Raw API metadata fields */
  createdAt?: string;
  modifiedAt?: string;
  archived?: boolean;
  favourited?: boolean;
  taggingStatus?: string;
  note?: string | null;
  summary?: string | null;
  /** Full content payload */
  content?: BookmarkContent;
  /** Associated assets */
  assets?: BookmarkAsset[];
  /** Legacy field */
  telegramUsername?: string;
}

/**
 * Raw API types for external bookmark provider (modular, for server fetch/normalization)
 */
export interface RawApiBookmarkTag {
  id: string;
  name: string;
  attachedBy: string;
}

export const RawApiBookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachedBy: z.string(),
});

export interface RawApiBookmarkContent {
  type: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl?: string;
  imageAssetId?: string;
  screenshotAssetId?: string;
  favicon?: string;
  htmlContent?: string;
  crawledAt?: string;
  author?: string | null;
  publisher?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
}

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

export interface RawApiBookmark {
  id: string;
  createdAt: string;
  modifiedAt: string;
  title: string | null;
  archived: boolean;
  favourited: boolean;
  taggingStatus: string;
  note: string | null;
  summary: string | null;
  tags: RawApiBookmarkTag[];
  content: RawApiBookmarkContent;
  assets: BookmarkAsset[];
}

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

export interface BookmarksApiResponse {
  bookmarks: RawApiBookmark[];
  nextCursor: string | null;
}

export const BookmarksApiResponseSchema = z.object({
  bookmarks: z.array(RawApiBookmarkSchema),
  nextCursor: z.string().nullable(),
});

// Helper function to validate API responses
export function validateBookmarksApiResponse(data: unknown): BookmarksApiResponse {
  return BookmarksApiResponseSchema.parse(data);
}

// Dataset validation helpers
// Re-export the validator from the centralized location
// This maintains backward compatibility while consolidating the logic
export { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
