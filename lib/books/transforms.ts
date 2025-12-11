/**
 * Book Transform Functions
 * @module lib/schemas/book
 * @description
 * Transform functions for mapping AudioBookShelf API responses to Book types.
 * Schemas and types live in types/schemas/book.ts
 */

import type { AbsLibraryItem, AbsTransformOptions, Book, BookListItem } from "@/types/schemas/book";
import { stripHtmlToText, containsHtmlTags } from "@/lib/utils/html";

// ─────────────────────────────────────────────────────────────────────────────
// Transform Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive ISBN-10 or ISBN-13 from raw ISBN string
 */
function parseIsbn(isbn: string | null | undefined): { isbn10?: string; isbn13?: string } {
  if (!isbn) return {};
  const clean = isbn.replace(/[-\s]/g, "");
  if (clean.length === 10) return { isbn10: clean };
  if (clean.length === 13) return { isbn13: clean };
  return {};
}

/**
 * Extract authors array from ABS metadata
 * Prefers structured authors array, falls back to authorName string
 */
function extractAuthors(
  authors: Array<{ name: string }> | undefined,
  authorName: string | null | undefined,
): string[] | undefined {
  // Prefer structured authors array if it has entries
  if (authors && authors.length > 0) {
    return authors.map(a => a.name);
  }
  // Fallback to authorName string (may contain comma-separated names)
  if (authorName) {
    return authorName
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Determine formats based on ebook and audio presence.
 * AudioBookShelf audio content implies both ebook and audiobook formats available,
 * since the source material exists in both forms.
 */
function determineFormats(
  ebookFormat: string | null | undefined,
  duration: number | undefined,
): Array<"ebook" | "audio"> {
  const hasAudio = duration && duration > 0;

  // Audio books from AudioBookShelf are treated as having both formats
  // since the content is available in both ebook and audio form
  if (hasAudio) {
    return ["ebook", "audio"];
  }

  // Pure ebook (no audio)
  if (ebookFormat) {
    return ["ebook"];
  }

  // Default to ebook if nothing detected
  return ["ebook"];
}

/**
 * Build cover URL from AudioBookShelf item ID
 */
function buildCoverUrl(itemId: string, baseUrl: string, apiKey: string): string {
  return `${baseUrl}/api/items/${itemId}/cover?token=${apiKey}`;
}

/**
 * Clean book description from AudioBookShelf.
 * ABS descriptions often contain HTML (e.g., <p> tags) that need stripping.
 * Only processes if HTML is detected to avoid unnecessary work.
 */
function cleanDescription(description: string | null | undefined): string | undefined {
  if (!description) return undefined;
  if (containsHtmlTags(description)) {
    return stripHtmlToText(description);
  }
  return description;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transform Functions (API -> Book)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform AudioBookShelf item to Book
 */
export function absItemToBook(item: AbsLibraryItem, options: AbsTransformOptions): Book {
  const meta = item.media.metadata;
  const isbns = parseIsbn(meta.isbn);
  const formats = determineFormats(item.media.ebookFormat, item.media.duration);
  const hasAudio = formats.includes("audio");

  return {
    id: item.id,
    title: meta.title,
    subtitle: meta.subtitle ?? undefined,
    authors: extractAuthors(meta.authors, meta.authorName),
    publisher: meta.publisher ?? undefined,
    publishedYear: meta.publishedYear ?? undefined,
    genres: meta.genres,
    description: cleanDescription(meta.description),
    asin: meta.asin ?? undefined,
    ...isbns,
    formats,
    audioNarrators: hasAudio ? meta.narrators?.map(n => n.name) : undefined,
    audioDurationSeconds: hasAudio ? item.media.duration : undefined,
    audioChapterCount: hasAudio ? item.media.chapters?.length : undefined,
    coverUrl: buildCoverUrl(item.id, options.baseUrl, options.apiKey),
  };
}

/**
 * Transform AudioBookShelf item to BookListItem
 */
export function absItemToBookListItem(item: AbsLibraryItem, options: AbsTransformOptions): BookListItem {
  const meta = item.media.metadata;
  return {
    id: item.id,
    title: meta.title,
    authors: extractAuthors(meta.authors, meta.authorName),
    coverUrl: buildCoverUrl(item.id, options.baseUrl, options.apiKey),
  };
}

/**
 * Transform array of AudioBookShelf items to Books
 */
export function absItemsToBooks(items: AbsLibraryItem[], options: AbsTransformOptions): Book[] {
  return items.map(item => absItemToBook(item, options));
}

/**
 * Transform array of AudioBookShelf items to BookListItems
 */
export function absItemsToBookListItems(items: AbsLibraryItem[], options: AbsTransformOptions): BookListItem[] {
  return items.map(item => absItemToBookListItem(item, options));
}
