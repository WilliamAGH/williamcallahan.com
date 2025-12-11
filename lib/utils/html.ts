/**
 * HTML Processing Utilities
 * @module lib/utils/html
 * @description
 * Server-side HTML parsing and text extraction using Cheerio.
 * Provides deterministic, reliable HTML-to-text conversion.
 */

import * as cheerio from "cheerio";

/**
 * Strips all HTML tags and returns plain text.
 * Collapses whitespace and trims the result.
 *
 * @example
 * stripHtmlToText("<p>Hello <strong>world</strong></p>")
 * // Returns: "Hello world"
 *
 * @param html - HTML string to process
 * @returns Plain text without HTML tags
 */
export function stripHtmlToText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  return $("body").text().replace(/\s+/g, " ").trim();
}

/**
 * Converts HTML to plain text while preserving paragraph structure.
 * Block elements (<p>, <div>, <br>, <li>, headings) become double newlines.
 * Useful for content that should maintain readable paragraph breaks.
 *
 * @example
 * htmlToPlainText("<p>First paragraph.</p><p>Second paragraph.</p>")
 * // Returns: "First paragraph.\n\nSecond paragraph."
 *
 * @param html - HTML string to process
 * @returns Plain text with paragraph breaks preserved
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  const $ = cheerio.load(html);

  // Insert paragraph markers before block elements
  $("p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote").each((_, el) => {
    $(el).before("\n\n");
  });

  // Extract text and normalize whitespace
  return $("body")
    .text()
    .replace(/[ \t]+/g, " ") // Collapse horizontal whitespace
    .replace(/\n{3,}/g, "\n\n") // Collapse excessive newlines
    .trim();
}

/**
 * Checks if a string contains HTML tags.
 * Useful for conditional processing of mixed content.
 *
 * @param text - String to check
 * @returns True if the string contains HTML tags
 */
export function containsHtmlTags(text: string): boolean {
  if (!text) return false;
  return /<[a-z][\s\S]*>/i.test(text);
}
