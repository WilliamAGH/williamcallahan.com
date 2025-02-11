/**
 * Schema.org JSON-LD Types
 * @module types/seo/schema
 * @description
 * Type definitions for Schema.org JSON-LD structured data.
 * These types follow the @graph pattern for proper entity relationships.
 */

import type { PacificDateString } from './shared';

/**
 * Base properties shared by all Schema.org entities
 */
interface SchemaBase {
  '@type': string;
  '@id': string;
}

/**
 * Person entity representing the website owner
 */
export interface PersonSchema extends SchemaBase {
  '@type': 'Person';
  name: string;
  description: string;
  url: string;
  sameAs: string[];
  image?: { '@id': string };
}

/**
 * Website entity representing the entire website
 */
export interface WebSiteSchema extends SchemaBase {
  '@type': 'WebSite';
  url: string;
  name: string;
  description: string;
  publisher: { '@id': string };
}

/**
 * Image entity for profile pictures and article images
 */
export interface ImageObjectSchema extends SchemaBase {
  '@type': 'ImageObject';
  url: string;
  contentUrl: string;
  caption?: string;
  width?: number;
  height?: number;
}

/**
 * Base webpage properties shared by all page types
 */
export interface WebPageBase extends SchemaBase {
  '@type': 'WebPage';
  isPartOf: { '@id': string };
  url: string;
  name: string;
  description: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  breadcrumb?: { '@id': string };
  primaryImageOfPage?: { '@id': string };
  about?: { '@id': string };
}

/**
 * Article entity for blog posts
 */
export interface ArticleSchema extends SchemaBase {
  '@type': 'Article';
  isPartOf: { '@id': string };
  author: { '@id': string };
  headline: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  mainEntityOfPage: { '@id': string };
  publisher: { '@id': string };
  image?: { '@id': string };
  articleSection: string;
  inLanguage: string;
  articleBody: string;
  keywords: string[];
}

/**
 * Dataset entity for investment data
 */
export interface DatasetSchema extends SchemaBase {
  '@type': 'Dataset';
  name: string;
  description: string;
  creator: { '@id': string };
  dateCreated: PacificDateString;
  dateModified: PacificDateString;
  license: string;
  isAccessibleForFree: boolean;
  includedInDataCatalog: {
    '@type': 'DataCatalog';
    name: string;
  };
}

/**
 * Collection page entity for blog listings and bookmarks
 */
export interface CollectionPageSchema extends SchemaBase {
  '@type': 'CollectionPage';
  isPartOf: { '@id': string };
  name: string;
  description: string;
  creator: { '@id': string };
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  mainEntity: {
    '@type': 'ItemList';
    itemListElement: Array<{
      '@type': 'ListItem';
      position: number;
      url: string;
    }>;
  };
}

/**
 * Breadcrumb navigation entity
 */
export interface BreadcrumbListSchema extends SchemaBase {
  '@type': 'BreadcrumbList';
  itemListElement: Array<{
    '@type': 'ListItem';
    position: number;
    item: {
      '@id': string;
      name: string;
    };
  }>;
}

/**
 * Complete schema graph structure
 */
export interface SchemaGraph {
  '@context': 'https://schema.org';
  '@graph': Array<
    | WebPageBase
    | ArticleSchema
    | PersonSchema
    | ImageObjectSchema
    | WebSiteSchema
    | BreadcrumbListSchema
    | DatasetSchema
    | CollectionPageSchema
  >;
}

/**
 * Parameters for generating page schemas
 */
export interface SchemaParams {
  path: string;
  title: string;
  description: string;
  datePublished: PacificDateString;
  dateModified: PacificDateString;
  image?: {
    url: string;
    width?: number;
    height?: number;
    caption?: string;
  };
  breadcrumbs?: Array<{
    path: string;
    name: string;
  }>;
  articleBody?: string;
  keywords?: string[];
  type?: 'article' | 'profile' | 'collection' | 'dataset';
}
