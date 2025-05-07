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
  const extension = cleanUrl?.split('.').pop()?.toLowerCase();
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
 * Formats a date for SEO metadata in Pacific Time
 * Ensures dates are in ISO 8601 format with proper timezone offset
 *
 * @example
 * formatSeoDate('2025-02-10')
 * // Returns: '2025-02-10T00:00:00-08:00'
 *
 * formatSeoDate('2025-07-10T15:30:00')
 * // Returns: '2025-07-10T15:30:00-07:00'
 *
 * @param date - The date to format (string or Date object)
 * @returns ISO 8601 formatted date string with Pacific Time offset
 * @see {@link "../../types/seo.ts"} - PacificDateString type definition
 */
export function formatSeoDate(date: string | Date | undefined): PacificDateString {
  if (!date) {
    date = new Date();
  }

  // If it's a date-only string (YYYY-MM-DD), append midnight time
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    date = `${date}T00:00:00`;
  }

  // Parse the date to get components
  const d = typeof date === 'string' ? new Date(date) : date;
  const month = d.getMonth() + 1; // 0-based

  // Determine if we're in DST (April-October)
  const isDST = month >= 4 && month <= 10;
  const offset = isDST ? '-07:00' : '-08:00';

  // If it's a string with time component, keep it as-is and just append timezone
  if (typeof date === 'string' && date.includes('T')) {
    return `${date}${offset}`;
  }

  // Format with components
  const year = d.getFullYear();
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');

  // Construct ISO 8601 string with Pacific Time offset
  const formatted = `${year}-${monthStr}-${day}T${hours}:${minutes}:${seconds}${offset}`;

  // Validate the format
  if (!isPacificDateString(formatted)) {
    // Convert to string explicitly to appease type checking
    const formattedStr = String(formatted);
    throw new Error(`Invalid date format: ${formattedStr}`);
  }

  return formatted;
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
