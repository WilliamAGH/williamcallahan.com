/**
 * Books Server Component
 * @module components/features/books/books.server
 * @description
 * Server component that fetches books from AudioBookShelf and renders the grid.
 * Handles data fetching and passes serializable data to client components.
 */

import "server-only";

import type { JSX } from "react";
import { connection } from "next/server";
import type { BookListItem } from "@/types/schemas/book";
import type { BooksServerProps } from "@/types/features/books";
import { fetchBookListItems } from "@/lib/books/audiobookshelf.server";
import { BooksClientGrid } from "./books-grid.client";

/**
 * Server component that fetches and renders the books grid.
 * Handles data fetching, error states, and passes clean data to client.
 *
 * Uses connection() to ensure fetch only runs during actual requests,
 * preventing HANGING_PROMISE_REJECTION during Next.js 16 prerendering.
 */
export async function BooksServer({ title, description, disclaimer }: BooksServerProps): Promise<JSX.Element> {
  // Wait for an actual request connection - prevents fetch during prerendering
  // which would cause HANGING_PROMISE_REJECTION errors in Next.js 16
  await connection();

  let books: BookListItem[] = [];
  let error: string | null = null;

  try {
    books = await fetchBookListItems();
  } catch (err) {
    console.error("[BooksServer] Failed to fetch books:", err);
    error = "Unable to load books at this time. Please try again later.";
  }

  return (
    <BooksClientGrid books={books} title={title} description={description} disclaimer={disclaimer} error={error} />
  );
}
