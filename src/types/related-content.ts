/**
 * Related Content Types
 *
 * Type definitions for the related content recommendation system that suggests
 * relevant content across bookmarks, blog posts, investments, projects, and books.
 */

/**
 * Content types that can be related/recommended
 */
export type RelatedContentType = "bookmark" | "blog" | "investment" | "project" | "thought" | "book";

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
  /** aVenture external research URL (for investments) */
  readonly aventureUrl?: string;
  /** Author information (for blog posts) */
  readonly author?: {
    readonly name: string;
    readonly avatar?: string;
  };
  /** Authors list (for books) */
  readonly authors?: readonly string[];
  /** Book formats (ebook, audio, print) */
  readonly formats?: readonly string[];
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
  /** Tags to exclude - items with any of these tags are filtered out */
  readonly excludeTags?: readonly string[];
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
  /** Precomputed display data for UI consumers */
  display?: NormalizedContentDisplay;
}

export interface NormalizedContentDisplay {
  description?: string;
  imageUrl?: string;
  author?: { name: string; avatar?: string };
  readingTime?: number;
  stage?: string;
  category?: string;
  aventureUrl?: string;
  bookmark?: {
    slug: string;
  };
  investment?: {
    name: string;
    website?: string;
    logoOnlyDomain?: string;
    logo?: string;
  };
  project?: {
    imageKey?: string;
    slug?: string;
  };
  book?: {
    authors?: string[];
    formats?: string[];
    slug: string;
  };
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
  /** ID of the source content */
  sourceId: string;
  /** Slug of the source content (DEPRECATED - slug should be embedded in bookmark objects) */
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
  /**
   * Source content type - items of this type appear first.
   * Also used to filter out disabled content types in production.
   */
  sourceType?: RelatedContentType;
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
 * Structure of the books related content JSON stored in S3
 */
export interface BooksRelatedContentData {
  /** Data format version */
  version: string;
  /** ISO timestamp when generated */
  generated: string;
  /** Total number of books processed */
  booksCount: number;
  /** Map of book keys to their related content entries */
  entries: Record<string, RelatedContentEntry[]>;
}

/**
 * Parsed and validated debug request parameters
 */
export interface DebugParams {
  sourceType: RelatedContentType;
  sourceId: string;
  limit: number;
  enabledTypes: RelatedContentType[];
}

/**
 * Scored content item with similarity breakdown
 */
export interface ScoredItem {
  type: RelatedContentType;
  id: string;
  title: string;
  tags: string[];
  domain: string | undefined;
  score: number;
  breakdown: Record<string, number>;
  matchedTags: string[];
}
