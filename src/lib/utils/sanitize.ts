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
// Build character ranges programmatically to avoid linter control-character warnings
const buildControlCharPattern = (): RegExp => {
  // ASCII control (0x00-0x1F), DEL+C1 (0x7F-0x9F), zero-width (200B-200F),
  // separators (2028-202F), bidi (2066-206F)
  const ranges: [number, number][] = [
    [0x00, 0x1f],
    [0x7f, 0x9f],
    [0x200b, 0x200f],
    [0x2028, 0x202f],
    [0x2066, 0x206f],
  ];
  const pattern = ranges
    .map(
      ([start, end]) =>
        `\\u${start.toString(16).padStart(4, "0")}-\\u${end.toString(16).padStart(4, "0")}`,
    )
    .join("");
  return new RegExp(`[${pattern}]`, "g");
};
const CONTROL_CHARS_REGEX = buildControlCharPattern();

export function sanitizeControlChars(str: string): string {
  if (!str) return "";
  return str.replace(CONTROL_CHARS_REGEX, "");
}
