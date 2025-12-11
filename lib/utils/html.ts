/**
 * HTML Processing Utilities
 * @module lib/utils/html
 * @description
 * Server-side HTML parsing and text extraction using Cheerio.
 * Provides deterministic, reliable HTML-to-text conversion.
 */

import * as cheerio from "cheerio";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Section headers commonly found in book descriptions (case-insensitive match) */
const SECTION_HEADERS = [
  "About the technology",
  "About the book",
  "About the reader",
  "About the author",
  "What's inside",
  "Table of Contents",
  "Summary",
  "Foreword",
  "Purchase of the print book",
];

/** Bullet characters to normalize */
const BULLET_CHARS = ["•", "●", "○", "◦", "▪", "▸", "►", "·"];

// ─────────────────────────────────────────────────────────────────────────────
// Core HTML Functions
// ─────────────────────────────────────────────────────────────────────────────

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

  // Extract text and normalize
  return normalizeWhitespace($("body").text());
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

// ─────────────────────────────────────────────────────────────────────────────
// Book Description Formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalizes whitespace: collapses spaces, ensures max one blank line between paragraphs.
 * Guarantees no double blank lines (cumulative/additive line breaks).
 */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, " ") // Collapse horizontal whitespace to single space
    .replace(/ ?\n ?/g, "\n") // Remove spaces around newlines
    .replace(/\n{3,}/g, "\n\n") // Max two newlines (one blank line)
    .trim();
}

/**
 * Converts bullet characters to standard format with line breaks.
 * Handles: • ● ○ ◦ ▪ ▸ ► · and * at line starts
 * Also detects "…and more!" style ending bullets that continue into following text.
 */
function formatBulletPoints(text: string): string {
  let result = text;

  // Convert various bullet chars to newline + bullet
  for (const bullet of BULLET_CHARS) {
    // Add line break before bullet if preceded by non-whitespace
    result = result.replace(new RegExp(`(?<=\\S)\\s*${escapeRegex(bullet)}\\s*`, "g"), "\n• ");
    // Normalize bullet at start or after whitespace
    result = result.replace(new RegExp(`(?:^|\\n)\\s*${escapeRegex(bullet)}\\s*`, "g"), "\n• ");
  }

  // Handle asterisk bullets at line starts
  result = result.replace(/(?:^|\n)\s*\*\s+/g, "\n• ");

  // Fix "…and more!" or similar ending bullets that run into following paragraph
  // Pattern: bullet line ending with "!" or "." followed by uppercase start of new sentence
  result = result.replace(/(\n• [^\n]*[!.])\s+([A-Z][a-z])/g, "$1\n\n$2");

  return result;
}

/**
 * Adds paragraph breaks before common section headers in book descriptions.
 */
function formatSectionHeaders(text: string): string {
  let result = text;

  for (const header of SECTION_HEADERS) {
    // Case-insensitive match, add double newline before header
    const pattern = new RegExp(`(?<!\\n\\n)(?=\\s*${escapeRegex(header)})`, "gi");
    result = result.replace(pattern, "\n\n");
  }

  return result;
}

/**
 * Formats numbered list items (Table of Contents, chapters).
 * Converts "1 Chapter 2 Chapter" to proper line breaks.
 * Only triggers when we see consecutive numbers (not standalone "PART 1").
 */
function formatNumberedLists(text: string): string {
  // Only format if we detect a Table of Contents pattern (multiple consecutive numbers)
  // Look for: "word/text N Word M Word" where N and M are sequential or close numbers
  // This avoids catching standalone "PART 1 - OBJECTS" as a list item

  // Check if this looks like a table of contents (has multiple numbered items in sequence)
  const tocPattern = /\d{1,2}\s+[A-Z][a-z]+.*?\d{1,2}\s+[A-Z][a-z]/;
  if (!tocPattern.test(text)) {
    return text;
  }

  // Format numbered items: number followed by capitalized word, when preceded by non-whitespace
  // Pattern must catch items like "world 3 A bookworm's" where the word after the number
  // may be an article (A, An, The) or a capitalized title word
  let result = text.replace(/(?<=\S)\s+(\d{1,2})\s+([A-Z])/g, "\n$1. $2");

  // Handle Appendix/Appendixes sections with letter markers (A, B, C, etc.)
  // Pattern: "Appendix[es] A Title B Title" or after a newline "A Title B Title"
  result = result.replace(/(?<=Appendix(?:es)?)\s+([A-G])\s+([A-Z][a-z])/gi, "\n$1. $2");
  result = result.replace(/(?<=\n[A-G]\.\s[^\n]+)\s+([A-G])\s+([A-Z][a-z])/g, "\n$1. $2");

  return result;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Formats book description text for clean display.
 * Handles HTML, bullet points, section headers, and ensures consistent line breaks.
 *
 * Processing order:
 * 1. Strip HTML tags (if present)
 * 2. Format section headers (add paragraph breaks)
 * 3. Format bullet points (normalize and add line breaks)
 * 4. Format numbered lists (Table of Contents)
 * 5. Normalize whitespace (guarantee no double blank lines)
 *
 * @example
 * formatBookDescription("<p>Great book! • Point 1 • Point 2 About the author John Doe.</p>")
 * // Returns clean text with proper breaks
 *
 * @param description - Raw book description (may contain HTML or plain text)
 * @returns Formatted description ready for display
 */
export function formatBookDescription(description: string): string {
  if (!description) return "";

  let text = description;

  // Step 1: Strip HTML if present
  if (containsHtmlTags(text)) {
    text = stripHtmlToText(text);
  }

  // Step 2: Format section headers (add breaks before them)
  text = formatSectionHeaders(text);

  // Step 3: Format bullet points
  text = formatBulletPoints(text);

  // Step 4: Format numbered lists
  text = formatNumberedLists(text);

  // Step 5: Final whitespace normalization (guarantees no double blank lines)
  text = normalizeWhitespace(text);

  return text;
}
