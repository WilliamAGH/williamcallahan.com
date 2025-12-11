/**
 * Books Server Component
 * @module components/features/books/books.server
 * @description
 * Server component that fetches books from AudioBookShelf and renders the grid.
 * Handles data fetching and passes serializable data to client components.
 *
 * This component uses the PPR (Partial Prerendering) pattern:
 * - It should be wrapped in a Suspense boundary by the parent page
 * - It calls connection() to create a "dynamic hole" that renders at request time
 * - This allows the page shell to be static while book data is fetched fresh
 *
 * @see https://nextjs.org/docs/app/api-reference/functions/connection
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
 * Uses connection() to ensure this component only renders at request time,
 * not during prerendering. This is required because we fetch live data
 * from the AudioBookShelf API that shouldn't be statically cached.
 */
export async function BooksServer({ title, description, disclaimer }: BooksServerProps): Promise<JSX.Element> {
  // Mark this component as dynamic - must render at request time, not during prerendering.
  // This creates a "dynamic hole" in the PPR static shell.
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
