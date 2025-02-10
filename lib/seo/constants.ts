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
/**
 * Date field names for various metadata standards
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/dateModified"} - Schema.org date properties
 * @see {@link "https://dublincore.org/specifications/dublin-core/dcmi-terms/#created"} - Dublin Core dates
 */
/**
 * SEO date field constants following current web standards
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage
 * @see {@link "https://schema.org/Article"} - Schema.org Article
 * @see {@link "https://developers.google.com/search/docs/appearance/publication-dates"} - Schema.org Person
 */
export const SEO_DATE_FIELDS = {
  // OpenGraph article dates (primary standard for social sharing)
  openGraph: {
    published: 'article:published_time',
    modified: 'article:modified_time'
  },
  // Standard HTML meta dates
  meta: {
    published: 'date',
    modified: 'last-modified'
  },
  // Schema.org dates for JSON-LD structured data
  jsonLd: {
    context: 'https://schema.org',
    dateFields: {
      created: 'dateCreated',
      published: 'datePublished',
      modified: 'dateModified'
    },
    types: {
      profile: 'ProfilePage',
      article: 'Article',
      person: 'Person',
      collection: 'CollectionPage'
    }
  },
  // Optional Dublin Core dates (legacy support)
  dublinCore: {
    created: 'DC.date.created',
    modified: 'DC.date.modified',
    issued: 'DC.date.issued'
  }
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
  articleBody?: string;
}
