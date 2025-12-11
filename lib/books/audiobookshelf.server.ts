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
  validateAbsLibraryItem,
  type AbsLibraryItem,
  type AbsSortField,
  type Book,
  type BookListItem,
  type FetchAbsLibraryItemsOptions,
} from "@/types/schemas/book";
import { absItemToBook, absItemsToBooks, absItemsToBookListItems } from "./transforms";
import { generateBookCoverBlur } from "./image-utils.server";

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
 * @param options - Fetch options including blur placeholder generation
 */
export async function fetchBooks(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<Book[]> {
  const { baseUrl, apiKey } = getConfig();
  const { includeBlurPlaceholders = false, ...fetchOptions } = options;

  const items = await fetchAbsLibraryItems(fetchOptions);
  const books = absItemsToBooks(items, { baseUrl, apiKey });

  // Optionally generate blur placeholders (parallel for performance)
  if (includeBlurPlaceholders) {
    await Promise.allSettled(
      books.map(async book => {
        if (book.coverUrl) {
          book.coverBlurDataURL = await generateBookCoverBlur(book.coverUrl);
        }
      }),
    );
  }

  return books;
}

/**
 * Fetch book list items (minimal data for grids)
 * @param options - Fetch options including blur placeholder generation
 */
export async function fetchBookListItems(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<BookListItem[]> {
  const { baseUrl, apiKey } = getConfig();
  const { includeBlurPlaceholders = false, ...fetchOptions } = options;

  const items = await fetchAbsLibraryItems(fetchOptions);
  const bookListItems = absItemsToBookListItems(items, { baseUrl, apiKey });

  // Optionally generate blur placeholders (parallel for performance)
  if (includeBlurPlaceholders) {
    await Promise.allSettled(
      bookListItems.map(async book => {
        if (book.coverUrl) {
          book.coverBlurDataURL = await generateBookCoverBlur(book.coverUrl);
        }
      }),
    );
  }

  return bookListItems;
}

/**
 * Fetch a single book by ID
 * @param id - AudioBookShelf item ID
 * @param options - Fetch options including blur placeholder generation
 */
export async function fetchBookById(
  id: string,
  options: { includeBlurPlaceholder?: boolean } = {},
): Promise<Book | null> {
  const { baseUrl, apiKey } = getConfig();
  const { includeBlurPlaceholder = false } = options;

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
    // Validate single item response against schema
    const item = validateAbsLibraryItem(data);
    const book = absItemToBook(item, { baseUrl, apiKey });

    // Optionally generate blur placeholder
    if (includeBlurPlaceholder && book.coverUrl) {
      book.coverBlurDataURL = await generateBookCoverBlur(book.coverUrl);
    }

    return book;
  } catch (error) {
    console.error(`[AudioBookShelf] Failed to fetch book ${id}:`, error);
    return null;
  }
}
