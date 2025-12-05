/**
 * Blog Feature Component Props
 *
 * SCOPE: Blog-specific component props and interfaces
 * USAGE: Use for blog articles, lists, cards, tags, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/blog.ts) rather than recreating similar structures.
 * Example: Use `post: BlogPost` instead of redefining blog properties inline.
 *
 * @see types/blog.ts for blog domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { ReactNode } from "react";
import type { WithContext, Article } from "schema-dts";
import type { ClientBoundaryProps } from "@/types/component-types";
import type { BlogPost } from "../blog";

/**
 * Core blog article component props
 * @usage - Blog post detail pages and article displays
 */
export interface BlogArticleProps {
  /** The blog post data to render */
  post: BlogPost;
  /** Pre-rendered MDX content from server component */
  mdxContent?: ReactNode;
  /** JSON-LD structured data for the blog post */
  jsonLd?: WithContext<Article>;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Blog article wrapper component props
 * @usage - Wrapping blog content with additional layout/context
 */
export interface BlogWrapperProps {
  /** Blog post data */
  post: BlogPost;
  /** Child components */
  children: ReactNode;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Blog author display component props
 * @usage - Author information display in articles
 */
export interface BlogAuthorProps {
  /** Author object with full information */
  author: import("../blog").Author;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Individual blog tag component props
 * @usage - Single tag display with optional linking
 */
export interface BlogTagProps {
  /** Tag name */
  tag: string;
  /** Optional URL for the tag */
  href?: string;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Blog tags collection component props
 * @usage - Multiple tags display with optional linking
 */
export interface BlogTagsProps {
  /** Array of tags to display */
  tags: string[];
  /** Base URL for tag links */
  baseUrl?: string;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Blog card component props
 * @usage - Blog post preview cards in lists/grids
 */
export interface BlogCardProps {
  /** Blog post data */
  post: BlogPost;
  /** Whether to show excerpt */
  showExcerpt?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Extended blog card props with loading priority
 * @usage - Blog cards that need performance optimization
 */
export interface BlogCardPropsExtended extends BlogCardProps {
  /** @deprecated Use `preload` instead (Next.js 16) */
  isPriority?: boolean;
  /** Preload the image in the document head (Next.js 16+) */
  preload?: boolean;
}

/**
 * Blog list component props
 * @usage - Lists of blog posts
 */
export interface BlogListProps {
  /** Array of blog posts */
  posts: BlogPost[];
  /** Optional title for the list */
  title?: string;
  /** Whether to show pagination */
  showPagination?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Server-side blog list component props
 * @usage - Server-rendered blog lists with pagination
 */
// Type alias - minimal extension
export type BlogListServerProps = BlogListProps & {
  currentPage?: number;
  totalPages?: number;
};

// Use generic WindowProps pattern
export type BlogWindowProps = import("../component-types").WindowProps<{ posts: BlogPost[] }>;

/**
 * Client-side blog component props
 * @usage - Interactive blog components with search/filtering
 */
export interface BlogClientProps {
  /** Array of blog posts */
  posts: BlogPost[];
  /** Whether to enable search */
  enableSearch?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * MDX image component props for blog articles
 * @usage - Images within blog article content
 */
export interface ArticleImageProps extends Omit<React.ComponentProps<"img">, "height" | "width" | "loading" | "style"> {
  /** Optional caption to display below the image */
  caption?: string;
  /** Display size presets of the image (ignored when widthPct or vwPct are provided) */
  size?: "full" | "medium" | "small";
  /** Whether the image is high priority for loading */
  priority?: boolean;
  /** Optional: constrain figure max-width to a percentage of its container (0-100). */
  widthPct?: number;
  /** Optional: constrain figure max-width to a percentage of the viewport width (0-100). */
  vwPct?: number;
}

/**
 * Blog article gallery component props
 * @usage - Image galleries within blog articles
 */
export interface ArticleGalleryProps {
  /** The content of the gallery */
  children: ReactNode;
  /** Optional CSS class names */
  className?: string;
}

/**
 * MDX content rendering component props
 * @usage - Rendering serialized MDX content
 */
export interface MDXContentProps {
  /** The serialized MDX content object */
  content: import("next-mdx-remote").MDXRemoteSerializeResult;
}

/**
 * Tag wrapper component props
 * @usage - Wrapping tag content with styling/linking
 */
export interface TagWrapperProps {
  /** Content to wrap */
  children: ReactNode;
  /** CSS classes */
  className: string;
  /** Optional link href */
  href?: string;
}

/**
 * Blog wrapper with children props
 * @usage - Generic blog components that wrap child content
 */
export interface BlogPropsWithChildren {
  /** Child content */
  children: ReactNode;
}

/**
 * Blog window client component props
 * @usage - Interactive blog windows with client-side functionality
 */
export interface BlogWindowClientProps extends ClientBoundaryProps {
  /** Server-rendered content to be displayed within the window */
  children: ReactNode;
}

/**
 * Extended blog tags props with interactivity
 * @usage - Interactive tag components with click handlers
 */
export interface BlogTagsPropsExtended extends Omit<BlogTagsProps, "baseUrl"> {
  /** Whether tags should be interactive/clickable */
  interactive?: boolean;
}

/**
 * Tweet embed component props
 * @usage - Embedding tweets in blog articles
 */
export interface TweetEmbedProps {
  /** Tweet URL */
  url: string;
  /** Optional width constraint */
  width?: number;
  /** Optional height constraint */
  height?: number;
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * Standard tweet embed component props
 * @usage - Standard Twitter embed implementation
 */
export interface StandardTweetEmbedProps {
  /** Tweet ID */
  id: string;
  /** Theme for the tweet embed */
  theme: "light" | "dark";
  /** Optional custom CSS classes */
  className?: string;
}

/**
 * Reading time metadata for a blog post
 * @see {@link "https://github.com/theodorusclarence/reading-time"}
 */
export interface ReadingTime {
  /** Reading time in minutes */
  minutes: number;
  /** The full text of reading time (e.g., "5 min read") */
  text: string;
  /** Reading time in milliseconds */
  time: number;
  /** Total number of words */
  words: number;
}

/**
 * Frontmatter data extracted from an MDX file
 */
export interface FrontmatterData {
  slug: string;
  title: string;
  author: string;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  modifiedAt?: string | Date; // Alias for updatedAt
  excerpt?: string;
  tags?: string[];
  readingTime?: number;
  coverImage?: unknown; // Keep as unknown for sanitizeCoverImage to handle
}

/**
 * @fileoverview Type definitions for blog-related features.
 * @description Contains types for blog posts, articles, and schema.org metadata.
 * @module types/features/blog
 */
