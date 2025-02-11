/**
 * Shared SEO Types
 * @module types/seo/shared
 * @description
 * Common type definitions shared across SEO modules.
 */

import { toISO } from '../../lib/dateTime';

/**
 * ISO 8601 date string in Pacific Time
 * @example "2025-02-10T10:54:28 PST"
 */
export type PacificDateString = string;

/**
 * Type guard for PacificDateString
 * Ensures a string is a valid date in Pacific timezone format
 */
export function isPacificDateString(date: string): date is PacificDateString {
  try {
    // First check if it's already a properly formatted Pacific date string
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) {
      return true;
    }
    // For other formats, use toISO to validate and format
    const formatted = toISO(date);
    // Verify it matches our expected format with timezone offset
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[-+]\d{2}:\d{2}$/.test(formatted);
  } catch {
    return false;
  }
}

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
