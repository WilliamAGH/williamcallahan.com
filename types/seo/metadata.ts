/**
 * Core SEO Metadata Types
 * @module types/seo/metadata
 * @description
 * Type definitions for core metadata functionality, excluding OpenGraph.
 * These types focus on standard meta tags, JSON-LD, and Dublin Core.
 */

import type { Metadata } from 'next';
import type { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';

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
 * Schema.org Article metadata
 * Used in JSON-LD structured data
 */
export interface ArticleSchema {
  '@context': 'https://schema.org';
  '@type': 'Article';
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
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
export interface BaseSchema {
  '@context': 'https://schema.org';
  name: string;
  description: string;
  dateCreated: string;
  dateModified: string;
  datePublished: string;
}

/**
 * Schema.org ProfilePage metadata
 * Used for personal, professional, and academic profile pages
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
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
export interface ArticleMetadata extends Omit<ExtendedMetadata, 'openGraph'> {
  openGraph?: OpenGraph;
  other: {
    [key: string]: string | number | (string | number)[];
  };
}
