/**
 * SEO Utility Functions
 *
 * Shared utility functions for URL and image processing in SEO metadata
 * Provides date formatting utilities compliant with OpenGraph and Schema.org requirements
 *
 * @module lib/seo/utils
 * @see {@link "https://ogp.me/#type_article"} OpenGraph date format requirements
 * @see {@link "https://schema.org/Article"} Schema.org date format requirements
 */

import type { PacificDateString } from "../../types/seo/shared";
import { NEXT_PUBLIC_SITE_URL } from "../constants/client";

/**
 * Ensures a URL is absolute by prepending the site URL if necessary
 *
 * @example
 * ensureAbsoluteUrl('/images/photo.jpg')
 * // Returns: 'https://williamcallahan.com/images/photo.jpg' (in production)
 *
 * ensureAbsoluteUrl('https://example.com/photo.jpg')
 * // Returns: 'https://example.com/photo.jpg'
 *
 * @param path - The URL or path to make absolute
 * @returns The absolute URL
 */
export function ensureAbsoluteUrl(path: string): string {
  // Return data URIs and non-http(s) protocols as-is
  if (path.startsWith("data:") || /^[a-z][a-z0-9+\-.]*:/i.test(path)) {
    return path;
  }

  // Handle empty or whitespace-only strings
  if (!path || !path.trim()) {
    // Test expects empty string to be treated as root relative path
    return NEXT_PUBLIC_SITE_URL.endsWith("/") ? NEXT_PUBLIC_SITE_URL : `${NEXT_PUBLIC_SITE_URL}/`;
  }

  // If it's already an absolute URL, return it as-is
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  // Remove any leading slashes to prevent double slashes when joining with base URL
  const cleanPath = path.replace(/^\/+/, "");

  // Prepend the site URL (with trailing slash if needed)
  const baseUrl = NEXT_PUBLIC_SITE_URL.endsWith("/") ? NEXT_PUBLIC_SITE_URL : `${NEXT_PUBLIC_SITE_URL}/`;

  return `${baseUrl}${cleanPath}`;
}

/**
 * Determines the MIME type of an image based on its file extension
 *
 * @example
 * getImageTypeFromUrl('photo.jpg')
 * // Returns: 'image/jpeg'
 *
 * getImageTypeFromUrl('logo.svg')
 * // Returns: 'image/svg+xml'
 *
 * @param url - The URL of the image
 * @returns The MIME type string or undefined if unknown
 * @see {@link "https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types"} MIME types reference
 */
export function getImageTypeFromUrl(url: string): string | undefined {
  if (!url) return undefined;

  // Remove query parameters and fragments before getting extension
  const cleanUrl = url.split(/[?#]/)[0];
  const extension = cleanUrl?.split(".").pop()?.toLowerCase();

  if (!extension) return undefined;

  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    default:
      return undefined; // Return undefined for unsupported extensions
  }
}

/**
 * Checks if a date is in Pacific Daylight Time (PDT)
 *
 * @param date - The date to check
 * @returns True if the date is in PDT, false if in PST
 */
function isPacificDaylightTime(date: Date): boolean {
  // Create a date in January (PST) and July (PDT) to get the timezone offset
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);

  // Get the timezone offset in minutes
  const janOffset = jan.getTimezoneOffset();
  const julOffset = jul.getTimezoneOffset();

  // The larger offset indicates the timezone is in DST (PDT)
  return Math.max(janOffset, julOffset) !== date.getTimezoneOffset();
}

/**
 * Gets the Pacific Time offset string (-08:00 for PST, -07:00 for PDT)
 *
 * @param date - The date to check
 * @returns The timezone offset string
 */
function getPacificOffset(date: Date): string {
  return isPacificDaylightTime(date) ? "-07:00" : "-08:00";
}

/**
 * Formats a date as an ISO 8601 string with Pacific Time offset for SEO metadata
 *
 * Converts date to the required format for OpenGraph and Schema.org with correct Pacific Time offset
 *
 * @param date - The date to format. If omitted, current date and time are used
 * @returns ISO 8601 date string with Pacific Time offset suitable for SEO metadata
 * @throws {Error} If the date string doesn't conform to the PacificDateString format
 */
export function formatSeoDate(date: string | Date | undefined | number): PacificDateString {
  let inputDate = date;
  if (typeof inputDate === "number") {
    throw new Error("Numeric timestamp inputs are not supported by formatSeoDate. Provide string or Date.");
  }
  if (!inputDate) {
    inputDate = new Date();
  }

  // If it's a date-only string (YYYY-MM-DD), append midnight time
  // Ensure this is done before creating the Date object if 'date' is a string
  let dateInputForConstructor: string | Date = inputDate;
  if (typeof inputDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(inputDate)) {
    dateInputForConstructor = `${inputDate}T00:00:00-08:00`; // Default to PST for date-only strings
  }

  // Parse the date to a Date object
  const d = new Date(dateInputForConstructor);

  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date provided to formatSeoDate");
  }

  // Get the offset based on the actual date
  const offset = getPacificOffset(d);

  // If it's a string with time component, use the exact time but update the timezone
  // Use 'd' (the Date object) for consistent formatting, not the original 'date' string
  // The original 'date' string might have a different timezone or format that we want to override with Pacific Time.

  // Format with components from the Date object 'd'
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offset}`;
}
