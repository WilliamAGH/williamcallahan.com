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
import type { OpenGraph } from 'next/dist/lib/metadata/types/opengraph-types';
import type { SEO_DATE_FIELDS } from '../lib/seo/constants';

/**
 * ISO 8601 date string with Pacific Time offset
 * Format: YYYY-MM-DDTHH:mm:ss-08:00 (or -07:00 during DST)
 * @example "2025-02-10T10:54:28-08:00"
 */
export type PacificDateString = string;

/**
 * Required date fields for article metadata
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph article dates
 * @see {@link "https://schema.org/Article"} - Schema.org article dates
 */
export interface ArticleDates {
  /** When the article was first created (may be different from publish date) */
  dateCreated?: PacificDateString;
  /** When the article was first published */
  datePublished: PacificDateString;
  /** When the article was last modified */
  dateModified: PacificDateString;
}

/**
 * OpenGraph image metadata
 * @see {@link "https://ogp.me/#structured"} - OpenGraph image properties
 */
export interface OpenGraphImage {
  url: string;
  secureUrl?: string;
  alt?: string;
  type?: string;
  width?: string | number;
  height?: string | number;
}

/**
 * Image SEO metadata combining various formats
 * @see {@link "https://ogp.me/#structured"} - OpenGraph image properties
 * @see {@link "https://schema.org/ImageObject"} - Schema.org image properties
 */
export interface ImageSEOMetadata {
  url: string;
  alt: string;
  title: string;
  openGraph?: OpenGraphImage;
  schema?: {
    '@type': 'ImageObject';
    url: string;
    width?: number;
    height?: number;
    caption?: string;
  };
}

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
  };
  images?: OpenGraphImage[];
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
  profile: {
    firstName?: string;
    lastName?: string;
    username?: string;
    gender?: string;
  };
  images?: OpenGraphImage[];
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
 * Schema.org ProfilePage metadata
 * Used in JSON-LD structured data
 */
export interface ProfileSchema {
  '@context': 'https://schema.org';
  '@type': 'ProfilePage';
  name: string;
  description: string;
  mainEntity: {
    '@type': 'Person';
    name: string;
    jobTitle: string;
    description: string;
  };
}

/**
 * HTML meta tag date fields
 * These appear in the page's <head> section
 */
export interface MetaDateFields {
  [SEO_DATE_FIELDS.meta.published]?: PacificDateString;
  [SEO_DATE_FIELDS.meta.modified]: PacificDateString;
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
};

/**
 * Complete article metadata structure
 * Combines all metadata types into a single interface
 */
export interface ArticleMetadata extends Omit<Metadata, 'openGraph' | 'other'> {
  openGraph: ArticleOpenGraph;
  other: MetaDateFields;
}

/**
 * Complete profile metadata structure
 * Combines all metadata types into a single interface
 */
export interface ProfileMetadata extends Omit<Metadata, 'openGraph' | 'other'> {
  openGraph: ProfileOpenGraph;
  other: MetaDateFields;
}

/**
 * Date format validation regex
 * Matches ISO 8601 format with Pacific Time offset
 * @example "2025-02-10T10:54:28-08:00"
 */
export const PACIFIC_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-0[87]:00$/;

/**
 * Type guard for PacificDateString
 * Ensures a string matches the required format
 */
export function isPacificDateString(date: string): date is PacificDateString {
  return PACIFIC_DATE_REGEX.test(date);
}

/**
 * Type guard for ArticleDates
 * Ensures all required date fields are present and properly formatted
 */
export function isArticleDates(dates: any): dates is ArticleDates {
  return (
    typeof dates === 'object' &&
    dates !== null &&
    isPacificDateString(dates.datePublished) &&
    isPacificDateString(dates.dateModified) &&
    (dates.dateCreated === undefined || isPacificDateString(dates.dateCreated))
  );
}
