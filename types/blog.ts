/**
 * Blog Types
 *
 * Type definitions for blog posts, authors, and related entities used throughout
 * the blog section of the application.
 */

import type { MDXRemoteSerializeResult } from 'next-mdx-remote';
import type { PacificDateString } from './seo/shared';

/**
 * Represents an image caption with metadata
 */
export interface ImageCaption {
  /** Main caption text */
  text: string;
  /** Photographer or image credit (optional) */
  photographer?: string;
  /** Date the photo was taken (optional) */
  date?: string;
}

/**
 * Represents a blog post with its complete content and metadata
 */
export interface BlogPost {
  /** Unique identifier for the post */
  id: string;
  /** Post title */
  title: string;
  /** URL-friendly slug */
  slug: string;
  /** Brief description or preview of the post */
  excerpt: string;
  /** Serialized MDX content */
  content: MDXRemoteSerializeResult;
  /** Publication date in ISO format with Pacific timezone */
  publishedAt: PacificDateString;
  /** Last update date in ISO format with Pacific timezone (optional) */
  updatedAt?: PacificDateString;
  /** Post author information */
  author: Author;
  /** Array of tag names */
  tags: string[];
  /** Estimated reading time in minutes (optional) */
  readingTime?: number;
  /**
   * URL of the post's cover image (optional)
   * If not provided, falls back to metadata.defaultImage.url from data/metadata.ts
   * @see {@link "../../data/metadata.ts"} - For default image configuration
   */
  coverImage?: string;
}

/**
 * Represents an author of blog posts
 */
export interface Author {
  /** Unique identifier for the author */
  id: string;
  /** Author's display name */
  name: string;
  /** URL of the author's avatar image (optional) */
  avatar?: string;
  /** Short biography or description (optional) */
  bio?: string;
}

/**
 * Represents a blog tag with metadata
 */
export interface BlogTag {
  /** Unique identifier for the tag */
  id: string;
  /** Display name of the tag */
  name: string;
  /** URL-friendly slug */
  slug: string;
  /** Number of posts using this tag */
  count: number;
}
