/**
 * Sitemap Date Utilities
 * @module lib/sitemap/date-utils
 * @description
 * Date parsing, path sanitization, and test environment detection
 * used across all sitemap collector modules.
 */

import type { UnifiedBookmark } from "@/types";

/**
 * Strip non-printable-ASCII characters from a URL path segment.
 */
export const sanitizePathSegment = (segment: string): string =>
  segment.replace(/[^\u0020-\u007E]/g, "");

/**
 * Safely parse a date string (including bare YYYY-MM-DD) into a Date.
 * Returns `undefined` for falsy or unparseable input.
 */
export const getSafeDate = (
  dateInput: string | Date | number | undefined | null,
): Date | undefined => {
  if (!dateInput) return undefined;
  try {
    let dateStr = String(dateInput);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateStr = `${dateStr}T23:59:59.999Z`;
    }
    const date = new Date(dateStr);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  } catch (error) {
    console.error(`Sitemap: Error parsing date: ${String(dateInput)}`, error);
  }
  return undefined;
};

/**
 * Return the latest defined Date from a variadic list.
 */
export const getLatestDate = (...dates: (Date | undefined)[]): Date | undefined =>
  dates.reduce<Date | undefined>((latest, current) => {
    if (current && (!latest || current > latest)) {
      return current;
    }
    return latest;
  }, undefined);

/**
 * Resolve the most recent modification date for a bookmark from its date fields.
 */
export const resolveBookmarkLastModified = (
  bookmark: Pick<UnifiedBookmark, "modifiedAt" | "dateUpdated" | "dateCreated" | "dateBookmarked">,
): Date | undefined =>
  getLatestDate(
    getSafeDate(bookmark.modifiedAt),
    getSafeDate(bookmark.dateUpdated),
    getSafeDate(bookmark.dateCreated),
    getSafeDate(bookmark.dateBookmarked),
  );

/**
 * Whether the current process is running inside a test harness.
 */
export const isTestEnvironment = (): boolean =>
  process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.TEST === "true";
