/**
 * Related Content Types
 *
 * Type definitions for the pgvector-based related content recommendation system.
 * Suggests relevant content across bookmarks, blog posts, investments, projects,
 * thoughts, and books using cosine similarity with blended scoring.
 */

import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import type { RelatedContentMetadata, RelatedContentType } from "@/types/schemas/related-content";

// ─── pgvector Pipeline Types ─────────────────────────────────────────────────

/**
 * A single cross-domain similarity result from pgvector cosine ANN search.
 */
export interface SimilarityCandidate {
  domain: ContentEmbeddingDomain;
  entityId: string;
  title: string;
  similarity: number;
  contentDate: string | null;
  /** Jaccard overlap of canonical tag slugs for bookmark-to-bookmark candidates (0..1). */
  tagOverlap?: number;
}

/**
 * SimilarityCandidate after blended scoring (cosine + recency + quality).
 */
export interface ScoredCandidate extends SimilarityCandidate {
  /** Final blended score incorporating cosine, recency, and quality signals. */
  score: number;
}

/**
 * Lean entry for content hydration: identifies an entity and its score.
 */
export interface HydrationEntry {
  domain: ContentEmbeddingDomain;
  entityId: string;
  score: number;
}

// ─── Domain Types ────────────────────────────────────────────────────────────

/**
 * UI-ready related content item with rich metadata.
 */
export interface RelatedContentSuggestion {
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
  /** Similarity score, 0-1. Higher = better match. */
  readonly score: number;
  /** Additional metadata for display */
  readonly metadata: RelatedContentMetadata;
}

// ─── Options & Component Props ───────────────────────────────────────────────

/**
 * Options for configuring related content queries.
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
}

/**
 * Props for RelatedContent server component.
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
 * Props for individual related content cards.
 */
export interface RelatedContentCardProps {
  /** The related content item */
  item: RelatedContentSuggestion;
  /** Optional click handler */
  onClick?: () => void;
  /** Optional CSS classes */
  className?: string;
  /** Show similarity score */
  showScore?: boolean;
}

/**
 * Props for RelatedContentSection component.
 */
export interface RelatedContentSectionProps {
  /** Section title */
  title: string;
  /** Related content items to display */
  items: RelatedContentSuggestion[];
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
