/**
 * Sitemap Collector Utilities
 * @module lib/sitemap/date-utils
 * @description
 * Shared helpers for sitemap collectors: date parsing, path sanitization,
 * error handling, and test-environment detection.
 */

/**
 * Strip non-printable-ASCII characters from a URL path segment.
 */
export const sanitizePathSegment = (segment: string): string =>
  segment.replace(/[^\u0020-\u007E]/g, "");

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
  const isTestEnv = isTestEnvironment();
  const shouldThrow =
    (throwStrategy === "throw-in-production" && !isTestEnv) ||
    (throwStrategy === "throw-in-test" && isTestEnv);

  const isExpectedTestFallback = isTestEnv && throwStrategy === "throw-in-production";
  if (!isExpectedTestFallback) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Sitemap] ${context}:`, message);
  }

  if (shouldThrow) {
    throw error;
  }

  return fallback;
};
