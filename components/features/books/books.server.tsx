/**
 * Books Server Component
 * @module components/features/books/books.server
 * @description
 * Server component that fetches books from AudioBookShelf and renders the grid.
 * Handles data fetching and passes serializable data to client components.
 *
 * Uses PPR with a request-time boundary to avoid prerender fetches:
 * - Wrapped in Suspense by the parent page
 * - Calls connection() to signal request-time rendering
 * - Data freshness comes from no-store fetches in the underlying service
 */

import "server-only";

import type { JSX } from "react";
import { connection } from "next/server";
import type { BookListItem } from "@/types/schemas/book";
import type { BooksServerProps } from "@/types/features/books";
import { fetchBookListItemsWithFallback } from "@/lib/books/audiobookshelf.server";
import { BooksClientGrid } from "./books-grid.client";

/**
 * Server component that fetches and renders the books grid.
 * Handles data fetching, error states, and passes clean data to client.
 */
export async function BooksServer({ title, description, disclaimer }: BooksServerProps): Promise<JSX.Element> {
  // Request-time boundary to prevent prerender from running AudioBookShelf fetches.
  await connection();

  let books: BookListItem[] = [];
  let error: string | null = null;
  let isStale = false;

  try {
    const result = await fetchBookListItemsWithFallback();
    books = result.books;
    isStale = result.isFallback;
  } catch (err) {
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
