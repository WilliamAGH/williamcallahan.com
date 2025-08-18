/**
 * Related Content Types
 *
 * Type definitions for the related content recommendation system that suggests
 * relevant content across bookmarks, blog posts, investments, and projects.
 */

import type { UnifiedBookmark } from "./bookmark";
import type { BlogPost } from "./blog";
import type { Investment } from "./investment";
import type { Project } from "./project";

/**
 * Content types that can be related/recommended
 */
export type RelatedContentType = "bookmark" | "blog" | "investment" | "project";

/**
 * Base interface for related content items
 */
export interface RelatedContentItem {
  /** Type of content */
  readonly type: RelatedContentType;
  /** Unique identifier */
  readonly id: string;
  /** Display title */
  readonly title: string;
  /** Brief description or excerpt */
  readonly description: string;
  /** URL to the content (relative or absolute) */
  readonly url: string;
  /**
   * Similarity score, expected to be between 0 and 1.
   * Higher scores indicate a better match.
   */
  readonly score: number;
  /** Additional metadata for display */
  readonly metadata: RelatedContentMetadata;
}

/**
 * Metadata for related content display
 */
export interface RelatedContentMetadata {
  /** Associated tags */
  readonly tags?: readonly string[];
  /** Domain for bookmarks */
  readonly domain?: string;
  /** Publication or creation date */
  readonly date?: string;
  /** Preview image URL */
  readonly imageUrl?: string;
  /** Reading time in minutes (for blog posts) */
  readonly readingTime?: number;
  /** Company stage (for investments) */
  readonly stage?: string;
  /** Business category */
  readonly category?: string;
  /** Author information (for blog posts) */
  readonly author?: {
    readonly name: string;
    readonly avatar?: string;
  };
}

/**
 * Configuration for similarity scoring
 */
export interface SimilarityWeights {
  /** Weight for tag matches (0-1) */
  readonly tagMatch: number;
  /** Weight for text similarity (0-1) */
  readonly textSimilarity: number;
  /** Weight for domain matches (0-1) */
  readonly domainMatch: number;
  /** Weight for recency (0-1) */
  readonly recency: number;
}

/**
 * Options for finding related content
 */
export interface RelatedContentOptions {
  /** Maximum number of results per content type */
  readonly maxPerType?: number;
  /** Total maximum results across all types */
  readonly maxTotal?: number;
  /** Content types to include */
  readonly includeTypes?: readonly RelatedContentType[];
  /** Content types to exclude */
  readonly excludeTypes?: readonly RelatedContentType[];
  /** IDs to exclude from results */
  readonly excludeIds?: readonly string[];
  /** Custom similarity weights */
  readonly weights?: Partial<SimilarityWeights>;
  /** Include debug information in results */
  readonly debug?: boolean;
}

/**
 * Response from related content API
 */
export interface RelatedContentResponse {
  /** Array of related content items */
  items: RelatedContentItem[];
  /** Total number of items found before limiting */
  totalFound: number;
  /** Metadata about the search */
  meta: {
    /** Time taken to compute results (ms) */
    computeTime: number;
    /** Whether results were served from cache */
    cached: boolean;
    /** Cache TTL in seconds */
    cacheTTL?: number;
  };
  /** Debug information if requested */
  debug?: {
    /** Detailed scoring breakdown per item */
    scores: Record<string, Record<keyof SimilarityWeights, number>>;
    /** Source content used for comparison */
    sourceContent: {
      type: RelatedContentType;
      id: string;
      tags: string[];
      text: string;
    };
  };
}

/**
 * Union type for all content sources
 */
export type ContentSource = UnifiedBookmark | BlogPost | Investment | Project;

/**
 * Normalized content for similarity comparison
 */
export interface NormalizedContent {
  /** Unique identifier */
  id: string;
  /** Content type */
  type: RelatedContentType;
  /** Display title */
  title: string;
  /** Text content for similarity matching */
  text: string;
  /** Associated tags */
  tags: string[];
  /** URL */
  url: string;
  /** Domain (for bookmarks) */
  domain?: string;
  /** Creation/publication date */
  date?: Date;
  /** Original source data */
  source: ContentSource;
}

/**
 * Cache entry for aggregated content
 */
export interface AggregatedContentCacheEntry {
  /** Normalized content data */
  data: NormalizedContent[];
  /** Timestamp when cached */
  timestamp: number;
}

/**
 * Cache entry for related content results
 */
export interface RelatedContentCacheData {
  /** Related items with scores */
  items: Array<NormalizedContent & { score: number; breakdown: Record<keyof SimilarityWeights, number> }>;
  /** Timestamp when cached */
  timestamp: number;
}

/**
 * Props for RelatedContent components
 */
export interface RelatedContentProps {
  /** Type of the source content */
  sourceType: RelatedContentType;
  /** ID of the source content (for non-bookmarks) */
  sourceId: string;
  /** Slug of the source content (required for bookmarks to maintain idempotency) */
  sourceSlug?: string;
  /** Optional title for the section */
  sectionTitle?: string;
  /** Optional custom options */
  options?: RelatedContentOptions;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Props for individual related content cards
 */
export interface RelatedContentCardProps {
  /** The related content item */
  item: RelatedContentItem;
  /** Optional click handler */
  onClick?: () => void;
  /** Optional CSS classes */
  className?: string;
  /** Show similarity score */
  showScore?: boolean;
}

/**
 * Props for RelatedContentSection component
 */
export interface RelatedContentSectionProps {
  /** Section title */
  title: string;
  /** Related content items to display */
  items: RelatedContentItem[];
  /** Optional CSS classes */
  className?: string;
  /** Show similarity scores on cards */
  showScores?: boolean;
}

/**
 * Content graph metadata structure
 */
export interface ContentGraphMetadata {
  /** Version of the graph format */
  version: string;
  /** Timestamp when generated */
  generated: string;
  /** Number of items by type */
  counts: {
    total: number;
    bookmarks: number;
    blog: number;
    investments: number;
    projects: number;
  };
  /** Unique tags found */
  uniqueTags: number;
  /** Building environment */
  environment: string;
}

/**
 * Tag graph structure for co-occurrence analysis
 */
export interface TagGraph {
  /** Map of tags to their metadata */
  tags: Record<
    string,
    {
      /** Total count of this tag */
      count: number;
      /** Co-occurrence counts with other tags */
      coOccurrences: Record<string, number>;
      /** IDs of content that has this tag */
      contentIds: string[];
      /** Most related tags */
      relatedTags: string[];
    }
  >;
  /** Tag hierarchy (parent -> children mapping) */
  tagHierarchy: Record<string, string[]>;
  /** Graph generation metadata */
  metadata?: {
    /** Total number of tags */
    totalTags: number;
    /** Total number of content items */
    totalContent: number;
    /** Generation timestamp */
    generated: string;
  };
}

/**
 * Pre-computed related content entry
 */
export interface RelatedContentEntry {
  /** Content type */
  type: RelatedContentType;
  /** Content ID */
  id: string;
  /** Similarity score */
  score: number;
  /** Display title */
  title: string;
  /** Optional metadata */
  metadata?: RelatedContentMetadata;
}

/**
 * Bookmarks index entry structure
 */
export interface BookmarksIndexEntry {
  /** Current page number */
  currentPage: number;
  /** Total pages available */
  totalPages: number;
  /** Total count of bookmarks */
  totalCount: number;
  /** Items per page */
  pageSize: number;
  /** Timestamp when generated */
  generated: string;
}

/**
 * Props for RelatedContentWithPagination component
 */
export interface RelatedContentWithPaginationProps {
  /** Type of the source content */
  sourceType: RelatedContentType;
  /** ID of the source content */
  sourceId: string;
  /** Slug of the source content (required for bookmarks to maintain idempotency) */
  sourceSlug?: string;
  /** Optional limit for items per page */
  limit?: number;
}
