/**
 * Sanitization Utilities
 *
 * Centralized string sanitization functions for consistent data handling.
 * Replaces ad-hoc regex patterns found throughout the codebase.
 *
 * @module lib/utils/sanitize
 */

/**
 * Sanitizes a string for use as a cache key or tag.
 * Allows alphanumeric characters, colons, underscores, and hyphens.
 * Replaces invalid characters with a hyphen.
 *
 * @param tag - The tag to sanitize
 * @returns Sanitized tag string
 */
export function sanitizeCacheTag(tag: string): string {
  if (!tag) return "";
  return tag.replace(/[^a-zA-Z0-9:_-]/g, "-");
}

/**
 * Sanitizes a string for use as a filename or path component.
 * Allows alphanumeric characters, dots, underscores, and hyphens.
 *
 * @param filename - The filename to sanitize
 * @returns Sanitized filename string
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "";
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * Sanitizes a title for use in a slug.
 * Allows alphanumeric characters, underscores, whitespace, and hyphens.
 *
 * @param title - The title to sanitize
 * @returns Sanitized title string
 */
export function sanitizeTitleSlug(title: string): string {
  if (!title) return "";
  return title.replace(/[^\w\s-]/g, "");
}

/**
 * Removes common Unicode control characters from a string.
 *
 * Ranges removed:
 * - \x00-\x1F: ASCII control characters (NUL, SOH, STX, etc.)
 * - \x7F-\x9F: DEL and C1 control characters
 * - \u200B-\u200F: Zero-width spaces and joiners
 * - \u2028-\u202F: Line/paragraph separators and narrow no-break space
 * - \u2066-\u206F: Bidirectional formatting characters
 *
 * @param str - The string to sanitize
 * @returns String with control characters removed
 */
export function sanitizeControlChars(str: string): string {
  if (!str) return "";
  return str.replace(/[\x00-\x1F\x7F-\x9F\u200B-\u200F\u2028-\u202F\u2066-\u206F]/g, "");
}
