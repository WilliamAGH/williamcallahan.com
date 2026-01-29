/**
 * SEO Type Definitions
 * @module types/seo
 * @description
 * Type definitions for SEO metadata, including OpenGraph, schema.org, and HTML meta tags.
 * Ensures type safety and proper field usage across the application.
 *
 * @see {@link "../lib/seo/constants.ts"} - SEO constants and field names
 * @see {@link "../lib/seo/metadata.ts"} - Metadata generation
 * @see {@link "../lib/seo/opengraph.ts"} - OpenGraph implementation
 */

import type { ArticleMetadata, CollectionPageMetadata, ProfilePageMetadata } from "./seo/metadata";
import type { ProfileOpenGraph } from "./seo/opengraph";

// Page Metadata Types
// MOVED to types/seo/metadata.ts

// Import for local use and for re-export
import {
  type ArticleDates,
  type ImageSEOMetadata,
  type OpenGraphImage,
  PACIFIC_DATE_REGEX,
  type PacificDateString,
  isArticleDates,
  isPacificDateString,
} from "./seo/shared";

// Re-export
export {
  type PacificDateString,
  type ArticleDates,
  type OpenGraphImage,
  type ImageSEOMetadata,
  PACIFIC_DATE_REGEX,
  isPacificDateString,
  isArticleDates,
  type ArticleMetadata,
  type CollectionPageMetadata,
  type ProfilePageMetadata,
};

/**
 * ISO 8601 date string with Pacific Time offset
 * Format: YYYY-MM-DDTHH:mm:ss-08:00 (or -07:00 during DST)
 * @example "2025-02-10T10:54:28-08:00"
 */

/**
 * Required date fields for article metadata
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/Article"} - Schema.org article dates
 */

/**
 * OpenGraph image metadata
 * @see {@link "https://ogp.me/#structured"} - OpenGraph image properties
 */

/**
 * Image SEO metadata combining various formats
 * @see {@link "https://ogp.me/#structured"} - OpenGraph image properties
 * @see {@link "https://schema.org/ImageObject"} - Schema.org image properties
 */

// MOVED to types/seo/opengraph.ts

// MOVED to types/seo/opengraph.ts

// MOVED to types/seo/schema.ts

/**
 * HTML meta tag date fields
 * These appear in the page's <head> section
 */
export interface MetaDateFields {
  // Standard HTML meta dates
  published?: PacificDateString;
  "last-modified": PacificDateString;

  // OpenGraph article dates
  "article:published_time"?: PacificDateString;
  "article:modified_time"?: PacificDateString;

  // Optional Dublin Core dates
  "DC.date.created"?: PacificDateString;
  "DC.date.modified"?: PacificDateString;
  "DC.date.issued"?: PacificDateString;

  // Allow for additional meta fields
  [key: string]: string | number | (string | number)[] | undefined;
}

/**
 * Type for Next.js metadata 'other' field
 * Ensures compatibility with Next.js types while maintaining our custom fields
 */
export type MetadataOther = {
  [key: string]: string | number | (string | number)[];
} & {
  "last-modified": string;
  published?: string;
  "article:published_time"?: string;
  "article:modified_time"?: string;
};

/**
 * Script metadata for JSON-LD
 */
export interface ScriptMetadata {
  type: "application/ld+json";
  text: string;
}

/**
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
// Import ExtendedMetadata from base to avoid circular dependencies
import type { ExtendedMetadata } from "./seo/base";
export type { ExtendedMetadata };

// MOVED to types/seo/metadata.ts

/**
 * Complete profile metadata structure
 * Combines all metadata types into a single interface
 */
export interface ProfileMetadata extends Omit<ExtendedMetadata, "openGraph" | "other"> {
  openGraph: ProfileOpenGraph;
  other: MetaDateFields;
}

/**
 * Date format validation regex
 * Matches ISO 8601 format with Pacific Time offset
 * @example "2025-02-10T10:54:28-08:00"
 */

/**
 * Type guard for PacificDateString
 * Ensures a string matches the required format
 */

/**
 * Type guard for ArticleDates
 * Ensures all required date fields are present and properly formatted
 */

/**
 * Shared interfaces for article metadata
 * @see {@link "../../types/seo.ts"} - Full type definitions
 */
export interface ArticleParams {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  tags?: string[];
  articleBody?: string;
  /** Whether to use NewsArticle schema (recommended for better SEO) */
  useNewsArticle?: boolean;
  /** Authors information for multiple authors */
  authors?: Array<{
    name: string;
    url?: string;
  }>;
}

/**
 * Shared interfaces for software application metadata
 * @see {@link "https://schema.org/SoftwareApplication"} - Schema.org SoftwareApplication
 */
export interface SoftwareAppParams {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified: string;
  tags?: string[];
  articleBody?: string;
  softwareName: string;
  operatingSystem?: string;
  applicationCategory?: string;
  isFree?: boolean;
  price?: number;
  priceCurrency?: string;
  ratingValue?: number;
  ratingCount?: number;
  downloadUrl?: string;
  softwareVersion?: string;
  screenshot?: string | string[];
  authors?: Array<{
    name: string;
    url?: string;
  }>;
}

export * from "./seo/opengraph";
export * from "./seo/schema";

/**
 * Text Truncation Types
 * @description Types for gradient truncation system that intelligently
 * truncates text between soft and hard limits while preserving readability.
 */

/**
 * Options for configuring text truncation behavior
 */
export interface TruncationOptions {
  /** Target length for truncation (60 for titles, 160 for descriptions) */
  softLimit: number;

  /** Absolute maximum length before hard truncation (default: softLimit + 20) */
  hardLimit?: number;

  /** String to append when text is truncated (default: '...') */
  ellipsis?: string;

  /** Separator to preserve in output (e.g., ' | ' for titles) */
  preserveSeparator?: string;

  /** Keywords that should be preserved if possible */
  importantKeywords?: string[];

  /** Content type hint for strategy selection */
  contentType?: "title" | "description" | "generic";

  /** Locale for internationalization support (default: 'en') */
  locale?: string;
}

/**
 * Result of a truncation operation
 */
export interface TruncationResult {
  /** The final truncated text */
  text: string;

  /** The original input text */
  original: string;

  /** Whether truncation was applied */
  wasTruncated: boolean;

  /** The strategy used for truncation */
  strategy: "none" | "filler-word" | "parenthetical" | "keyword" | "smart-end" | "hard";

  /** Metrics about the truncation operation */
  metrics: TruncationMetrics;
}

/**
 * Detailed metrics about a truncation operation
 */
export interface TruncationMetrics {
  /** Length of the original text (Unicode-aware) */
  originalLength: number;

  /** Length of the final text (Unicode-aware) */
  finalLength: number;

  /** Number of characters over the soft limit */
  overage: number;

  /** Ratio of overage to allowed overage (0-1 scale) */
  overageRatio: number;

  /** Time taken to perform truncation (milliseconds) */
  processingTime: number;

  /** Whether Unicode-aware processing was used */
  unicodeAware: boolean;
}

/**
 * Parameters for creating a truncation result
 * Consolidates createResult function parameters into a single object
 */
export interface CreateResultParams {
  /** The original input text */
  original: string;
  /** The final truncated text */
  text: string;
  /** Whether truncation was applied */
  wasTruncated: boolean;
  /** The strategy used for truncation */
  strategy: TruncationResult["strategy"];
  /** Length of the original text (Unicode-aware) */
  originalLength: number;
  /** Number of characters over the soft limit */
  overage: number;
  /** Time when truncation started (performance.now()) */
  startTime: number;
  /** Whether Unicode-aware processing was used (default: true) */
  unicodeAware?: boolean;
  /** Target length for truncation */
  softLimit?: number;
  /** Absolute maximum length before hard truncation */
  hardLimit?: number;
}
