/**
 * Book Slug Helpers
 * @module lib/books/slug-helpers
 * @description
 * Utilities for generating URL-safe slugs from book data.
 * Reuses the existing titleToSlug utility for consistency.
 */

import { titleToSlug } from "@/lib/utils/domain-utils";
import type { Book, BookListItem } from "@/types/schemas/book";

/**
 * Generate a URL-safe slug from a book title and ID.
 * Uses titleToSlug for the title portion and appends a short ID suffix for uniqueness.
 *
 * TODO: Once books are persisted to Chroma vector DB, we can implement collision-only
 * suffix logic (like bookmarks). The suffix would only be appended when multiple books
 * share the same title slug, resulting in cleaner URLs for unique titles:
 * - `/books/the-pragmatic-programmer` (unique title, no suffix)
 * - `/books/the-art-of-war-3def` (collision, gets suffix)
 *
 * @param title - The book title
 * @param id - The book ID (e.g., "li_abc123def")
 * @returns URL-safe slug (e.g., "the-pragmatic-programmer-3def")
 */
export function generateBookSlug(title: string, id: string): string {
  const titleSlug = titleToSlug(title, 50);

  // Extract last 4 chars of ID for uniqueness (remove "li_" prefix if present)
  const cleanId = id.replace(/^li_/, "");
  const shortId = cleanId.slice(-4);

  return titleSlug ? `${titleSlug}-${shortId}` : shortId;
}

/**
 * Extract the short book ID suffix from a slug.
 * The ID is the last segment after the final hyphen (4 chars).
 */
export function extractBookIdSuffixFromSlug(slug: string): string | null {
  const parts = slug.split("-");
  if (parts.length < 2) return null;

  const shortId = parts[parts.length - 1];
  if (!shortId || shortId.length !== 4) return null;

  return shortId;
}

/**
 * Find a book by its slug from a list of books.
 * Matches by comparing the generated slug or by ID suffix.
 */
export function findBookBySlug<T extends Book | BookListItem>(slug: string, books: T[]): T | null {
  // Try exact slug match first
  for (const book of books) {
    const generatedSlug = generateBookSlug(book.title, book.id);
    if (generatedSlug === slug) {
      return book;
    }
  }

  // Fallback: match by ID suffix
  const shortId = extractBookIdSuffixFromSlug(slug);
  if (shortId) {
    for (const book of books) {
      const cleanId = book.id.replace(/^li_/, "");
      if (cleanId.endsWith(shortId)) {
        return book;
      }
    }
  }

  return null;
}
