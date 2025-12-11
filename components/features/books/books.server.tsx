/**
 * Books Server Component
 * @module components/features/books/books.server
 * @description
 * Server component that fetches books from AudioBookShelf and renders the grid.
 * Handles data fetching and passes serializable data to client components.
 *
 * Strategy: Cache Components pattern (NO connection() bailout)
 * - Uses fetch with cache: "no-store" for fresh data on each request
 * - Gracefully handles AudioBookShelf unavailability with empty state
 * - Compatible with Next.js 16 cacheComponents mode
 */

import "server-only";

import type { JSX } from "react";
import type { BookListItem } from "@/types/schemas/book";
import type { BooksServerProps } from "@/types/features/books";
import { fetchBookListItemsWithFallback } from "@/lib/books/audiobookshelf.server";
import { BooksClientGrid } from "./books-grid.client";

/**
 * Server component that fetches and renders the books grid.
 * Handles data fetching, error states, and passes clean data to client.
 *
 * No connection() bailout - this allows the page to be statically analyzed
 * at build time while still fetching fresh data at runtime via no-store fetches.
 */
export async function BooksServer({ title, description, disclaimer }: BooksServerProps): Promise<JSX.Element> {
  let books: BookListItem[] = [];
  let error: string | null = null;
  let isStale = false;

  try {
    const result = await fetchBookListItemsWithFallback();
    books = result.books;
    isStale = result.isFallback;
  } catch (err) {
    // Log but don't crash - render empty state gracefully
    console.error("[BooksServer] Failed to fetch books:", err);
    error = "Unable to load books at this time. Please try again later.";
  }

  return (
    <BooksClientGrid
      books={books}
      title={title}
      description={description}
      disclaimer={disclaimer}
      error={error}
      isStale={isStale}
    />
  );
}
