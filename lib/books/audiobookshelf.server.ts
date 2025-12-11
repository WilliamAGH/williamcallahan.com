/**
 * AudioBookShelf API Client
 * @module lib/books/audiobookshelf
 * @description
 * Server-side client for AudioBookShelf API.
 * Fetches library items and transforms to Book types.
 *
 * TODO: Investigate Next.js 16 caching via MCP (nextjs_docs tool) for API content.
 * Goal: Avoid repeated API calls on every page render using modern Next.js patterns
 * such as "use cache", cacheLife(), cacheTag(), or fetch cache options.
 * See: docs/projects/structure/next-js-16-usage.md for project patterns.
 */

import { fetchWithTimeout } from "@/lib/utils/http-client";
import {
  validateAbsLibraryItemsResponse,
  type AbsLibraryItem,
  type AbsSortField,
  type Book,
  type BookListItem,
  type FetchAbsLibraryItemsOptions,
} from "@/types/schemas/book";
import { absItemToBook, absItemsToBooks, absItemsToBookListItems } from "./transforms";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ABS_BASE_URL = process.env.AUDIOBOOKSHELF_URL;
const ABS_API_KEY = process.env.AUDIOBOOKSHELF_API_KEY;
const ABS_LIBRARY_ID = process.env.AUDIOBOOKSHELF_LIBRARY_ID;

function getConfig() {
  if (!ABS_BASE_URL || !ABS_API_KEY || !ABS_LIBRARY_ID) {
    throw new Error(
      "AudioBookShelf config missing. Set AUDIOBOOKSHELF_URL, AUDIOBOOKSHELF_API_KEY, AUDIOBOOKSHELF_LIBRARY_ID",
    );
  }
  return { baseUrl: ABS_BASE_URL, apiKey: ABS_API_KEY, libraryId: ABS_LIBRARY_ID };
}

// ─────────────────────────────────────────────────────────────────────────────
// API Fetcher
// ─────────────────────────────────────────────────────────────────────────────

async function absApi<T>(path: string, validate: (data: unknown) => T): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    timeout: 10000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`AudioBookShelf API error: ${response.status} ${response.statusText}`);
  }

  const data: unknown = await response.json();
  return validate(data);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all library items from AudioBookShelf
 * @param options - Optional sorting configuration
 * @returns Array of library items, sorted by addedAt descending by default (newest first)
 */
export async function fetchAbsLibraryItems(options: FetchAbsLibraryItemsOptions = {}): Promise<AbsLibraryItem[]> {
  const { libraryId } = getConfig();
  const { sort = "addedAt", desc = true } = options;

  // Build query: limit=0 fetches all items, sort and desc control ordering
  const query = new URLSearchParams({
    limit: "0",
    sort,
    desc: desc ? "1" : "0",
  });

  const response = await absApi(
    `/api/libraries/${libraryId}/items?${query.toString()}`,
    validateAbsLibraryItemsResponse,
  );
  return response.results;
}

// Re-export sort types for consumers
export type { AbsSortField, FetchAbsLibraryItemsOptions };

/**
 * Fetch all books (transformed from AudioBookShelf)
 */
export async function fetchBooks(): Promise<Book[]> {
  const { baseUrl, apiKey } = getConfig();
  const items = await fetchAbsLibraryItems();
  return absItemsToBooks(items, { baseUrl, apiKey });
}

/**
 * Fetch book list items (minimal data for grids)
 */
export async function fetchBookListItems(): Promise<BookListItem[]> {
  const { baseUrl, apiKey } = getConfig();
  const items = await fetchAbsLibraryItems();
  return absItemsToBookListItems(items, { baseUrl, apiKey });
}

/**
 * Fetch a single book by ID
 */
export async function fetchBookById(id: string): Promise<Book | null> {
  const { baseUrl, apiKey } = getConfig();

  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/items/${id}?expanded=1`, {
      timeout: 10000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`AudioBookShelf API error: ${response.status}`);
    }

    const data: unknown = await response.json();
    // Single item response has different shape - validate inline
    const item = data as AbsLibraryItem;
    return absItemToBook(item, { baseUrl, apiKey });
  } catch (error) {
    console.error(`[AudioBookShelf] Failed to fetch book ${id}:`, error);
    return null;
  }
}
