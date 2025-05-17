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

import type { Metadata } from 'next';
import type { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types'; // eslint-disable-line @typescript-eslint/no-unused-vars
import type { SEO_DATE_FIELDS } from '../lib/seo/constants';

// Import for local use and for re-export
import {
  type PacificDateString,
  type ArticleDates,
  type OpenGraphImage,
  type ImageSEOMetadata,
  PACIFIC_DATE_REGEX,
  isPacificDateString,
  isArticleDates
} from './seo/shared';

// Re-export
export {
  type PacificDateString,
  type ArticleDates,
  type OpenGraphImage,
  type ImageSEOMetadata,
  PACIFIC_DATE_REGEX,
  isPacificDateString,
  isArticleDates
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

/**
 * OpenGraph article metadata structure
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article specification
 */
export type ArticleOpenGraph = {
  title: string;
  description: string;
  url: string;
  siteName?: string;
  locale?: string;
  type: 'article';
  article: {
    publishedTime: string;
    modifiedTime: string;
    section?: string;
    tags?: string[];
    authors?: string[];
  };
  images?: OpenGraphImage[];
  // Root level dates for better compatibility
  publishedTime?: string;
  modifiedTime?: string;
};

/**
 * OpenGraph profile metadata structure
 * @see {@link "https://ogp.me/#type_profile"} - OpenGraph profile specification
 */
export type ProfileOpenGraph = {
  title: string;
  description: string;
  url: string;
  siteName?: string;
  locale?: string;
  type: 'profile';
  firstName?: string;
  lastName?: string;
  username?: string;
  gender?: string;
  images?: OpenGraphImage[];
  publishedTime?: string;
  modifiedTime?: string;
};

/**
 * Schema.org Article metadata
 * Used in JSON-LD structured data
 */
export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  author: {
    '@type': 'Person';
    name: string;
    url?: string;
  };
  publisher: {
    '@type': 'Organization';
    name: string;
    logo?: {
      '@type': 'ImageObject';
      url: string;
    };
  };
  image?: {
    '@type': 'ImageObject';
    url: string;
    caption?: string;
  };
  mainEntityOfPage: {
    '@type': 'WebPage';
    '@id': string;
  };
}

/**
 * Schema.org base metadata shared by all page types
 */
interface BaseSchema {
  '@context': 'https://schema.org';
  name: string;
  description: string;
  dateCreated: PacificDateString;
  dateModified: PacificDateString;
  datePublished: PacificDateString;
}

/**
 * Schema.org ProfilePage metadata
 * Used for personal, professional, and academic profile pages
 * @see {@link "https://schema.org/ProfilePage"} - Schema.org ProfilePage specification
 */
export interface ProfileSchema extends BaseSchema {
  '@type': 'ProfilePage';
  mainEntity: {
    '@type': 'Person';
    name: string;
    description: string;
    sameAs?: string[];
    image?: string;
  };
}

/**
 * Schema.org CollectionPage metadata
 * Used for pages that list multiple items (blog posts, investments, bookmarks)
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */
export interface CollectionSchema extends BaseSchema {
  '@type': 'CollectionPage';
  mainEntity: {
    '@type': 'ItemList';
    itemListElement: Array<{
      '@type': 'ListItem';
      position: number;
      url: string;
      name: string;
    }>;
  };
}

/**
 * HTML meta tag date fields
 * These appear in the page's <head> section
 */
export interface MetaDateFields {
  // Standard HTML meta dates
  [SEO_DATE_FIELDS.meta.published]?: PacificDateString;
  [SEO_DATE_FIELDS.meta.modified]: PacificDateString;

  // OpenGraph article dates
  [SEO_DATE_FIELDS.openGraph.published]?: PacificDateString;
  [SEO_DATE_FIELDS.openGraph.modified]?: PacificDateString;

  // Optional Dublin Core dates
  [SEO_DATE_FIELDS.dublinCore.created]?: PacificDateString;
  [SEO_DATE_FIELDS.dublinCore.modified]?: PacificDateString;
  [SEO_DATE_FIELDS.dublinCore.issued]?: PacificDateString;

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
  [SEO_DATE_FIELDS.meta.modified]: string;
  [SEO_DATE_FIELDS.meta.published]?: string;
  [SEO_DATE_FIELDS.openGraph.published]?: string;
  [SEO_DATE_FIELDS.openGraph.modified]?: string;
};

/**
 * Script metadata for JSON-LD
 */
export interface ScriptMetadata {
  type: 'application/ld+json';
  text: string;
}

/**
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
/**
 * Next.js metadata with script support
 * Extends the base Metadata type to include script field
 */
export interface ExtendedMetadata extends Metadata {
  script?: Array<{
    type: string;
    text: string;
  }>;
}

/**
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
export interface ArticleMetadata extends Omit<ExtendedMetadata, 'openGraph' | 'other'> {
  openGraph: ArticleOpenGraph;
  other: MetaDateFields;
}

/**
 * Complete profile metadata structure
 * Combines all metadata types into a single interface
 */
export interface ProfileMetadata extends Omit<ExtendedMetadata, 'openGraph' | 'other'> {
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
