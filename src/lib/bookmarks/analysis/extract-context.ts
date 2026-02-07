/**
 * Bookmark Analysis Context Extraction
 * @module lib/bookmarks/analysis/extract-context
 * @description
 * Extracts pertinent fields from a bookmark for LLM prompt construction.
 * Client-safe (no cheerio/server-only dependencies).
 */

import type { UnifiedBookmark, BookmarkTag } from "@/types";
import type { BookmarkAnalysisContext } from "@/types/bookmark-ai-analysis";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum characters for the content excerpt sent to LLM */
const MAX_CONTENT_EXCERPT_LENGTH = 2500;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips HTML tags from a string using regex.
 * Client-safe alternative to cheerio-based stripping.
 */
function stripHtmlTags(html: string): string {
  if (!html) return "";

  return (
    html
      // Remove script and style elements entirely
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
      .replaceAll(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
      // Remove all HTML tags
      .replaceAll(/<[^>]+>/g, " ")
      // Decode common HTML entities
      .replaceAll("&nbsp;", " ")
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&apos;", "'")
      // Collapse whitespace
      .replaceAll(/\s+/g, " ")
      .trim()
  );
}

/**
 * Truncates text to a maximum length, breaking at word boundaries.
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Extracts tag names from bookmark tags (handles both string[] and BookmarkTag[]).
 */
function extractTagNames(tags: (string | BookmarkTag)[] | undefined): string[] {
  if (!tags || tags.length === 0) return [];

  return tags.map((tag) => (typeof tag === "string" ? tag : tag.name));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extracts context from a bookmark for LLM analysis prompt construction.
 *
 * @param bookmark - The unified bookmark to extract context from
 * @returns Structured context object with pertinent fields
 */
export function extractBookmarkAnalysisContext(bookmark: UnifiedBookmark): BookmarkAnalysisContext {
  // Extract and clean HTML content
  let contentExcerpt: string | null = null;
  if (bookmark.content?.htmlContent) {
    const plainText = stripHtmlTags(bookmark.content.htmlContent);
    if (plainText.length > 0) {
      contentExcerpt = truncateText(plainText, MAX_CONTENT_EXCERPT_LENGTH);
    }
  }

  return {
    title: bookmark.title,
    url: bookmark.url,
    description: bookmark.description || null,
    tags: extractTagNames(bookmark.tags),
    author: bookmark.content?.author ?? null,
    publisher: bookmark.content?.publisher ?? null,
    existingSummary: bookmark.summary ?? null,
    note: bookmark.note ?? null,
    contentExcerpt,
  };
}
