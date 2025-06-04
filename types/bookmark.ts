import type { JSX } from "react";
/**
 * Bookmarks API Types
 *
 * Types for the bookmarks API
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
  attachedBy?: 'ai' | 'user';
}

// Define known content types with a catch-all fallback
export type ContentType = 'link' | 'image' | 'video' | (string & {});

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

export interface BookmarksApiResponse {
  bookmarks: RawApiBookmark[];
  nextCursor: string | null;
}
