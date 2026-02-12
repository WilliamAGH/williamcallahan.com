/**
 * Sitemap Collector Utilities
 * @module lib/sitemap/date-utils
 * @description
 * Shared helpers for sitemap collectors: date parsing, path sanitization,
 * error handling, and test-environment detection.
 */

import type { UnifiedBookmark } from "@/types";

/**
 * Strip non-printable-ASCII characters from a URL path segment.
 */
export const sanitizePathSegment = (segment: string): string =>
  segment.replace(/[^\u0020-\u007E]/g, "");

/**
 * Safely parse a value into a Date. Accepts unknown input (e.g. frontmatter
 * fields, S3 metadata) and returns `undefined` for falsy or unparseable values.
 * Bare YYYY-MM-DD strings are treated as end-of-day UTC to ensure they sort
 * after any same-day timestamped entries.
 */
export const getSafeDate = (dateInput: unknown): Date | undefined => {
  if (dateInput === null || dateInput === undefined || dateInput === "") return undefined;
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

/**
 * Shared error handler for sitemap collectors.
 * Logs the error, then either re-throws or returns a fallback:
 *
 *  - "throw-in-production" → THROWS in production, returns fallback in test
 *  - "throw-in-test"       → THROWS in test, returns fallback in production
 */
export const handleSitemapCollectorError = <T>(
  context: string,
  error: unknown,
  fallback: T,
  throwStrategy: "throw-in-test" | "throw-in-production" = "throw-in-test",
): T => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[Sitemap] ${context}:`, message);

  const isTestEnv = isTestEnvironment();
  const shouldThrow =
    (throwStrategy === "throw-in-production" && !isTestEnv) ||
    (throwStrategy === "throw-in-test" && isTestEnv);
  if (shouldThrow) {
    throw error;
  }

  return fallback;
};
