/**
 * SEO Utility Functions
 * @module lib/seo/utils
 * @description
 * Shared utility functions used by both metadata.ts and opengraph.ts modules.
 * These functions handle common operations like URL resolution, image type detection,
 * and date formatting according to SEO standards.
 *
 * @see {@link "./metadata.ts"} - Main metadata implementation
 * @see {@link "./opengraph.ts"} - OpenGraph metadata implementation
 * @see {@link "https://ogp.me/#type_article"} - OpenGraph date format requirements
 * @see {@link "https://schema.org/Article"} - Schema.org date format requirements
 */

import { NEXT_PUBLIC_SITE_URL } from '../constants';
import { toISO, toOpenGraph, PACIFIC_TIMEZONE } from '../dateTime';
import { isPacificDateString, type PacificDateString } from '../../types/seo';

/**
 * Ensures a URL is absolute by prepending the site URL if necessary
 * Used by both metadata and OpenGraph modules to ensure all URLs are fully qualified
 *
 * @example
 * ensureAbsoluteUrl('/images/photo.jpg')
 * // Returns: 'https://williamcallahan.com/images/photo.jpg' (in production)
 * // Returns: 'http://localhost:3000/images/photo.jpg' (in development)
 *
 * ensureAbsoluteUrl('https://example.com/photo.jpg')
 * // Returns: 'https://example.com/photo.jpg'
 *
 * @param path - The URL or path to make absolute
 * @returns The absolute URL
 */
export function ensureAbsoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const isProd = NEXT_PUBLIC_SITE_URL === 'https://williamcallahan.com';
  const baseUrl = isProd ? 'https://williamcallahan.com' : NEXT_PUBLIC_SITE_URL;
  return `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Determines the MIME type of an image based on its file extension
 * Used primarily by the OpenGraph module to set correct image types
 * in metadata tags.
 *
 * @example
 * getImageTypeFromUrl('photo.jpg')
 * // Returns: 'image/jpeg'
 *
 * getImageTypeFromUrl('logo.svg')
 * // Returns: 'image/svg+xml'
 *
 * @param url - The URL of the image
 * @returns The MIME type string
 * @see {@link "https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types"} - MIME types reference
 */
export function getImageTypeFromUrl(url: string): string {
  // Remove query parameters and fragments before getting extension
  const cleanUrl = url.split(/[?#]/)[0];
  const extension = cleanUrl.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'svg': return 'image/svg+xml';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    default: return 'image/jpeg'; // Fallback to JPEG if extension is unknown
  }
}

/**
 * Formats a date for Schema.org metadata in Pacific Time
 * @param date - The date to format
 * @returns ISO 8601 formatted date string in Pacific Time
 */
export function formatSeoDate(date: string | Date | undefined, includeTimezone = true): string {
  // If it's already a properly formatted Pacific date string
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) {
    if (!includeTimezone) {
      return date;
    }
    // Add timezone offset
    const d = new Date(date);
    const month = d.getMonth(); // 0-11
    // PDT (March-November), PST (rest of the year)
    const offset = month >= 2 && month <= 10 ? '-07:00' : '-08:00';
    return `${date}${offset}`;
  }
  // Otherwise convert to Pacific time
  const isoDate = toISO(date);
  return includeTimezone ? isoDate : isoDate.replace(/[-+]\d{2}:\d{2}$/, '');
}

/**
 * Formats a date for OpenGraph metadata
 * @param date - The date to format
 * @param type - The type of date (published or modified)
 * @returns Date string in appropriate format for OpenGraph
 */
export function formatOpenGraphDate(date: string | Date | undefined, type: 'published' | 'modified'): string {
  // If it's already a properly formatted Pacific date string and it's a published date, add timezone offset
  if (type === 'published' && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(date)) {
    // Get timezone offset for the date
    const d = new Date(date);
    const month = d.getMonth(); // 0-11
    // PDT (March-November), PST (rest of the year)
    const offset = month >= 2 && month <= 10 ? '-07:00' : '-08:00';
    return `${date}${offset}`;
  }
  // Otherwise use toOpenGraph which handles timezone conversion if needed
  return toOpenGraph(date, type);
}

/**
 * Validates that a date string is in the correct format for SEO metadata
 * Used to ensure dates meet OpenGraph and schema.org requirements
 *
 * @param date - The date string to validate
 * @returns True if the date is valid and in the correct format
 */
export function validateSeoDate(date: string): boolean {
  return isPacificDateString(date);
}
