/**
 * Blog Types
 *
 * Type definitions for blog posts, authors, and related entities used throughout
 * the blog section of the application.
 */

import type { MDXRemoteSerializeResult } from "next-mdx-remote";

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
  content: MDXRemoteSerializeResult<Record<string, unknown>, Record<string, unknown>>;
  /** Raw MDX content string (optional, for searching) */
  rawContent?: string;
  /** Publication date in ISO format */
  publishedAt: string;
  /** Last update date in ISO format (optional) */
  updatedAt?: string;
  /** Post author information */
  author: Author;
  /** Array of tag names */
  tags: string[];
  /** Estimated reading time in minutes (optional) */
  readingTime?: number;
  /** URL of the post's cover image (optional) */
  coverImage?: string;
  /** Optional: Original file path of the MDX file */
  filePath?: string;
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
  /** Short biography or description (optional, supports JSX for inline links) */
  bio?: React.ReactNode;
  /** URL to author's profile or website (optional) */
  url?: string;
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

export interface BlogPostPageProps {
  // params might be a Promise due to instrumentation and needs to be awaited.
  params: Promise<{ slug: string }>;
}

export interface BlogPageFrontmatter {
  title: string;
  publishedAt: string | Date; // gray-matter can parse dates
  tags: string[];
  author: string; // Assuming author in frontmatter is an ID string for this simplified getter
  excerpt?: string;
  updatedAt?: string | Date;
  coverImage?: string;
}
