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

const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const PACIFIC_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
});

function formatOffset(totalMinutes: number): string {
  const sign = totalMinutes <= 0 ? "-" : "+";
  const absMinutes = Math.abs(totalMinutes);
  const hours = String(Math.floor(absMinutes / 60)).padStart(2, "0");
  const minutes = String(absMinutes % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

function getPacificDateParts(date: Date): {
  year: string;
  month: string;
  day: string;
  hours: string;
  minutes: string;
  seconds: string;
  offset: string;
} {
  const parts = PACIFIC_DATE_FORMATTER.formatToParts(date);
  const partMap = new Map(parts.map(part => [part.type, part.value]));
  const year = partMap.get("year") ?? "0000";
  const month = partMap.get("month") ?? "01";
  const day = partMap.get("day") ?? "01";
  const hours = partMap.get("hour") ?? "00";
  const minutes = partMap.get("minute") ?? "00";
  const seconds = partMap.get("second") ?? "00";
  const offsetMinutes = Math.round(
    (Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)) -
      date.getTime()) /
      60000,
  );
  const offset = formatOffset(offsetMinutes);

  return { year, month, day, hours, minutes, seconds, offset };
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

  const pacific = getPacificDateParts(d);

  return `${pacific.year}-${pacific.month}-${pacific.day}T${pacific.hours}:${pacific.minutes}:${pacific.seconds}${pacific.offset}`;
}
