/**
 * SEO Field Name Constants
 * @module lib/seo/constants
 * @description
 * Defines structural constants for SEO metadata field names.
 * These constants define the standard field names used across different metadata formats.
 *
 * Note: Actual metadata values are defined in data/metadata.ts
 *
 * @see {@link "../../data/metadata.ts"} - Source of metadata values
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specifications
 * @see {@link "https://schema.org/Article"} - Schema.org article specifications
 * @see {@link "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name"} - HTML meta name specifications
 */

/**
 * SEO Date Field Names
 * Central source of truth for all date-related metadata field names.
 * These fields must be used consistently across all metadata implementations.
 *
 * @see {@link "../metadata.ts"} - Usage in metadata generation
 * @see {@link "../opengraph.ts"} - Usage in OpenGraph metadata
 * @see {@link "../../types/seo.ts"} - Type definitions
 */
export const SEO_DATE_FIELDS = {
  openGraph: {
    published: 'article:published_time',
    modified: 'article:modified_time',
  },
  meta: {
    published: 'date',
    modified: 'last-modified',
  },
  schema: {
    published: 'datePublished',
    modified: 'dateModified',
  },
} as const;

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
}
