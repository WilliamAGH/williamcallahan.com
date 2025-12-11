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
  "Appendixes",
  "Appendix",
];

/** Bullet characters to normalize */
const BULLET_CHARS = ["•", "●", "○", "◦", "▪", "▸", "►", "·"];

/** Words that commonly start new paragraphs after bullet lists (signals end of list) */
const PARAGRAPH_STARTERS = [
  "In",
  "Whether",
  "This",
  "The",
  "About",
  "Purchase",
  "Each",
  "Every",
  "All",
  "Most",
  "Some",
  "Many",
  "These",
  "Those",
  "Throughout",
  "After",
  "Before",
  "As",
  "When",
  "Because",
  "Since",
  "Although",
  "While",
  "If",
  "With",
  "Without",
  "By",
  "Through",
  "From",
  "What",
  "Who",
  "Why",
  "How",
  "Here",
  "There",
  "Now",
  "Today",
  "Currently",
  "Previously",
  "Finally",
  "Additionally",
  "Furthermore",
  "Moreover",
  "However",
  "Nevertheless",
];

/** Action verbs commonly used at start of list items in book descriptions */
const ACTION_VERBS = [
  "Master",
  "Implement",
  "Build",
  "Create",
  "Use",
  "Utilize",
  "Handle",
  "Make",
  "Learn",
  "Understand",
  "Discover",
  "Explore",
  "Design",
  "Write",
  "Deploy",
  "Test",
  "Configure",
  "Develop",
  "Set",
  "Work",
  "Manage",
  "Apply",
  "Practice",
  "Integrate",
  "Optimize",
  "Debug",
  "Install",
  "Run",
  "Execute",
  "Define",
  "Establish",
  "Organize",
  "Structure",
  "Plan",
  "Analyze",
  "Evaluate",
];

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

  // Ensure line break BEFORE first bullet in a list (if preceded by text)
  result = result.replace(/([^\n])\n• /g, "$1\n\n• ");

  // Ensure line break AFTER last bullet item
  // Case 1: bullet item on its own line, followed by non-bullet line
  result = result.replace(/(\n• [^\n]+)\n([^•\n])/g, "$1\n\n$2");

  // Case 2: bullet item text runs into paragraph text on SAME line
  // Detect using paragraph-starting words that signal end of list
  const paragraphStarterPattern = PARAGRAPH_STARTERS.join("|");
  result = result.replace(
    new RegExp(`(\\n• [^•\\n]+?)\\s+(${paragraphStarterPattern})\\s+([A-Z])`, "g"),
    "$1\n\n$2 $3",
  );

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
 * Detects unmarked lists using multiple independent signals.
 * Returns true only when there's high confidence the text contains a list.
 *
 * Detection rule: colonDirectVerb AND (explicitIntro OR knownListSection OR highVerbDensity)
 *
 * This requires:
 * 1. Structural evidence: Colon followed directly by an action verb
 * 2. Confirming evidence: Explicit intro phrase, known section header, or high verb density
 */
function detectUnmarkedList(text: string): boolean {
  // Skip if already has bullet markers
  if (/[•●○◦▪▸►·]/.test(text)) {
    return false;
  }

  const actionVerbPattern = ACTION_VERBS.join("|");

  // Signal 1: Colon followed DIRECTLY by action verb (not article/preposition)
  const colonDirectVerb = new RegExp(`:\\s+(${actionVerbPattern})\\b`).test(text);
  if (!colonDirectVerb) {
    return false; // Required signal
  }

  // Signal 2: Explicit list introduction phrase
  const explicitIntro =
    /you will learn(?: how to)?:|you(?:'ll| will) (?:learn|discover|master):|what you(?:'ll| will) learn:|in this book,? you will:|features include:|includes?:/i.test(
      text,
    );

  // Signal 3: Known list section headers
  const knownListSection = /what'?s inside:?|key features:?|you(?:'ll| will) (?:learn|get|discover):/i.test(text);

  // Signal 4: High action verb density (4+ verbs AND >5% of words)
  const verbMatches = text.match(new RegExp(`\\b(${actionVerbPattern})\\b`, "g"));
  const verbCount = verbMatches?.length ?? 0;
  const wordCount = text.split(/\s+/).length;
  const verbDensity = verbCount / wordCount;
  const highVerbDensity = verbCount >= 4 && verbDensity > 0.05;

  // Require structural signal + at least one confirming signal
  return explicitIntro || knownListSection || highVerbDensity;
}

/**
 * Formats unmarked lists by adding bullets before action verbs.
 * Only processes text that passes the multi-signal detection.
 * Detects list end when sentence punctuation is followed by a non-action-verb word.
 */
function formatUnmarkedLists(text: string): string {
  if (!detectUnmarkedList(text)) {
    return text;
  }

  const actionVerbPattern = ACTION_VERBS.join("|");

  // Find the colon that introduces the list
  const colonMatch = text.match(new RegExp(`(:\\s*)(${actionVerbPattern})\\b`));
  if (!colonMatch || colonMatch.index === undefined) {
    return text;
  }

  const colonEnd = colonMatch.index + (colonMatch[1]?.length ?? 0);
  const beforeList = text.slice(0, colonEnd);
  const afterColon = text.slice(colonEnd);

  // Find where the list ENDS: sentence punctuation followed by non-action-verb word
  // Pattern: [.!?] + space + Capital word that is NOT an action verb
  const listEndPattern = new RegExp(`([.!?])\\s+(?!(${actionVerbPattern})\\b)([A-Z][a-z])`, "g");
  const listEndMatch = listEndPattern.exec(afterColon);

  let listPart: string;
  let afterList: string;

  if (listEndMatch && listEndMatch.index !== undefined && listEndMatch[1]) {
    // Include the punctuation in the list part, then add paragraph break
    const endIdx = listEndMatch.index + listEndMatch[1].length;
    listPart = afterColon.slice(0, endIdx);
    afterList = "\n\n" + afterColon.slice(endIdx).trimStart();
  } else {
    // No clear end found, treat entire rest as list
    listPart = afterColon;
    afterList = "";
  }

  // Add bullet before first item (right after colon)
  let formattedList = listPart.replace(new RegExp(`^(${actionVerbPattern})\\b`), "\n• $1");

  // Words that commonly precede verbs in normal prose (not list boundaries)
  const nonBoundaryWords = new Set([
    "in",
    "with",
    "for",
    "to",
    "from",
    "by",
    "on",
    "of",
    "about",
    "using",
    "into",
    "through",
    "a",
    "an",
    "the",
    "and",
    "or",
    "can",
    "will",
    "should",
    "must",
    "may",
    "could",
    "would",
  ]);

  // Use function-based replacement to properly filter non-boundary words
  const wordVerbPattern = new RegExp(`(\\w+)\\s+(${actionVerbPattern})\\b`, "gi");

  // Iteratively add bullets before action verbs
  let prev = "";
  while (formattedList !== prev) {
    prev = formattedList;
    formattedList = formattedList.replace(wordVerbPattern, (match: string, word: string, verb: string) => {
      // Don't add bullet if:
      // 1. Word is a non-boundary word (preposition, article, etc.)
      // 2. Already has bullet marker before it
      if (nonBoundaryWords.has(word.toLowerCase())) {
        return match;
      }
      // Check if this position already has a bullet (don't double-bullet)
      return `${word}\n• ${verb}`;
    });
  }

  return beforeList + formattedList + afterList;
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
 * 3. Format unmarked lists (detect and add bullets using multi-signal heuristic)
 * 4. Format bullet points (normalize existing bullets and add line breaks)
 * 5. Format numbered lists (Table of Contents)
 * 6. Normalize whitespace (guarantee no double blank lines)
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

  // Step 3: Format unmarked lists (using multi-signal detection)
  text = formatUnmarkedLists(text);

  // Step 4: Format bullet points (normalize existing bullets)
  text = formatBulletPoints(text);

  // Step 5: Format numbered lists
  text = formatNumberedLists(text);

  // Step 6: Final whitespace normalization (guarantees no double blank lines)
  text = normalizeWhitespace(text);

  return text;
}
