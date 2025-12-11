/**
 * Book Slug Helpers
 * @module lib/books/slug-helpers
 * @description
 * Utilities for generating URL-safe slugs from book data.
 * Format: title-author1-author2-{id|isbn}
 * - Uses full AudioBookShelf ID as suffix for uniqueness
 * - Falls back to ISBN-13 or ISBN-10 if no API source ID
 */

import { titleToSlug } from "@/lib/utils/domain-utils";
import type { Book } from "@/types/schemas/book";

/**
 * Generate a URL-safe slug from book data.
 * Format: title-author1-author2-{absId|isbn}
 *
 * @example
 * // With ABS ID: "typescript-quickly-yakov-fain-anton-moiseev-li_8gch9ve09orgn4fdz8"
 * // With ISBN fallback: "the-pragmatic-programmer-andy-hunt-dave-thomas-9780135957059"
 */
export function generateBookSlug(
  title: string,
  id: string,
  authors?: string[],
  isbn13?: string,
  isbn10?: string,
): string {
  // Title slug (max 50 chars)
  const titleSlug = titleToSlug(title, 50);

  // Authors slug (max 2 authors, 20 chars each)
  const authorsSlug = authors
    ?.slice(0, 2)
    .map(a => titleToSlug(a, 20))
    .filter(Boolean)
    .join("-");

  // ID suffix: prefer ABS ID, fallback to ISBN
  const idSuffix = id || isbn13 || isbn10 || "";

  // Build slug parts
  const parts = [titleSlug, authorsSlug, idSuffix].filter(Boolean);
  return parts.join("-");
}

/**
 * Extract the book ID suffix from a slug.
 * The ID is everything after the last occurrence of author names.
 * For ABS IDs, format is "li_..." or raw alphanumeric.
 * For ISBN fallback, it's a 10 or 13 digit number.
 */
export function extractBookIdFromSlug(slug: string): string | null {
  // ABS IDs start with "li_" in the slug
  const absIdMatch = slug.match(/li_[a-z0-9]+$/i);
  if (absIdMatch) return absIdMatch[0];

  // Check for ISBN-13 (13 digits at end)
  const isbn13Match = slug.match(/\d{13}$/);
  if (isbn13Match) return isbn13Match[0];

  // Check for ISBN-10 (10 chars at end, may include X)
  const isbn10Match = slug.match(/[\dX]{10}$/i);
  if (isbn10Match) return isbn10Match[0];

  // Fallback: last segment after final hyphen
  const parts = slug.split("-");
  const lastPart = parts[parts.length - 1];
  return parts.length > 1 && lastPart ? lastPart : null;
}

/**
 * Find a book by its slug from a list of books.
 * Matches by generated slug or by ID/ISBN suffix.
 */
export function findBookBySlug<T extends Pick<Book, "id" | "title" | "authors" | "isbn13" | "isbn10">>(
  slug: string,
  books: T[],
): T | null {
  // Try exact slug match first
  for (const book of books) {
    const generated = generateBookSlug(book.title, book.id, book.authors, book.isbn13, book.isbn10);
    if (generated === slug) return book;
  }

  // Fallback: match by ID suffix
  const extractedId = extractBookIdFromSlug(slug);
  if (extractedId) {
    for (const book of books) {
      // Match ABS ID
      if (book.id === extractedId || book.id.endsWith(extractedId)) return book;
      // Match ISBN
      if (book.isbn13 === extractedId || book.isbn10 === extractedId) return book;
    }
  }

  return null;
}
