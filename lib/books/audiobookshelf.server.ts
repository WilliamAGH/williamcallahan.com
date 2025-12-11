/**
 * AudioBookShelf API Client
 * @module lib/books/audiobookshelf
 * @description
 * Server-side client for AudioBookShelf API.
 * Fetches library items and transforms to Book types with a resilient,
 * request-time strategy and an in-memory last-good snapshot for fallbacks.
 */

import { fetchWithTimeout } from "@/lib/utils/http-client";
import { envLogger } from "@/lib/utils/env-logger";
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

const SNAPSHOT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours to keep "last good" data reasonably fresh
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

const cloneBook = (book: Book): Book => structuredClone(book);

let lastBooksSnapshot: { booksById: Map<string, Book>; fetchedAt: number } | null = null;

const snapshotIsFresh = (
  snapshot: { booksById: Map<string, Book>; fetchedAt: number } | null,
  ttlMs: number,
): snapshot is { booksById: Map<string, Book>; fetchedAt: number } => {
  if (!snapshot) return false;
  return Date.now() - snapshot.fetchedAt <= ttlMs;
};

const cacheSnapshot = (books: Book[]): void => {
  lastBooksSnapshot = {
    booksById: new Map(books.map(book => [book.id, cloneBook(book)])),
    fetchedAt: Date.now(),
  };
};

const upsertBookIntoSnapshot = (book: Book): void => {
  const now = Date.now();
  if (!lastBooksSnapshot) {
    lastBooksSnapshot = { booksById: new Map([[book.id, cloneBook(book)]]), fetchedAt: now };
    return;
  }
  lastBooksSnapshot.booksById.set(book.id, cloneBook(book));
  lastBooksSnapshot.fetchedAt = now;
};

const getSnapshotBooks = (ttlMs: number): Book[] | null => {
  if (!snapshotIsFresh(lastBooksSnapshot, ttlMs)) return null;
  return Array.from(lastBooksSnapshot.booksById.values()).map(cloneBook);
};

const getSnapshotBookById = (id: string, ttlMs: number): Book | null => {
  if (!snapshotIsFresh(lastBooksSnapshot, ttlMs)) return null;
  const book = lastBooksSnapshot.booksById.get(id);
  return book ? cloneBook(book) : null;
};

async function absApi<T>(path: string, validate: (data: unknown) => T): Promise<T> {
  const { baseUrl, apiKey } = getConfig();
  const url = `${baseUrl}${path}`;

  const response = await fetchWithTimeout(url, {
    timeout: 10000,
    // Use time-based revalidation instead of no-store to avoid static-to-dynamic error
    // 5 minutes cache keeps data reasonably fresh while allowing static prerendering
    next: { revalidate: 300 },
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
 * Internal helper to fetch all books (transformed from AudioBookShelf)
 * @param options - Fetch options including blur placeholder generation
 */
async function fetchBooksFresh(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<Book[]> {
  const { baseUrl, apiKey } = getConfig();
  const { includeBlurPlaceholders = false, ...fetchOptions } = options;

  const items = await fetchAbsLibraryItems(fetchOptions);
  const books = absItemsToBooks(items, { baseUrl, apiKey });

  // Optionally generate blur placeholders (parallel for performance)
  if (includeBlurPlaceholders) {
    const results = await Promise.allSettled(
      books.map(async book => {
        if (book.coverUrl) {
          book.coverBlurDataURL = await generateBookCoverBlur(book.coverUrl);
        }
      }),
    );
    // Log any failures for debugging without blocking the response
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(`[AudioBookShelf] Blur placeholder failed for book index ${index}:`, result.reason);
      }
    });
  }

  return books;
}

/**
 * Fetch all books with a resilient fallback to the last-good in-memory snapshot.
 * Defaults to allowing stale data when AudioBookShelf is unavailable.
 * Never throws - returns empty array if all fallbacks are exhausted.
 */
export async function fetchBooksWithFallback(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean; allowStale?: boolean } = {},
): Promise<{ books: Book[]; isFallback: boolean; fetchedAt: number }> {
  const { allowStale = true, ...rest } = options;
  const now = Date.now();

  try {
    const books = await fetchBooksFresh(rest);
    cacheSnapshot(books);
    return { books, isFallback: false, fetchedAt: now };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "AudioBookShelf fetch failed, considering fallback snapshot",
      { error: message },
      { category: "Books" },
    );

    const snapshotBooks = allowStale ? getSnapshotBooks(SNAPSHOT_TTL_MS) : null;
    if (snapshotBooks) {
      return { books: snapshotBooks, isFallback: true, fetchedAt: lastBooksSnapshot?.fetchedAt ?? now };
    }

    // Return empty array instead of throwing - allows page to render gracefully
    envLogger.log(
      "AudioBookShelf unavailable and no snapshot - returning empty books list",
      { error: message },
      { category: "Books" },
    );
    return { books: [], isFallback: true, fetchedAt: now };
  }
}

/**
 * Preserve legacy signature while routing through the resilient fetch.
 */
export async function fetchBooks(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<Book[]> {
  const result = await fetchBooksWithFallback({ ...options, allowStale: true });
  return result.books;
}

/**
 * Fetch book list items (minimal data for grids) with fallback to snapshot.
 * Gracefully handles missing AudioBookShelf config (returns empty array).
 * @param options - Fetch options including blur placeholder generation
 */
export async function fetchBookListItemsWithFallback(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<{ books: BookListItem[]; isFallback: boolean; fetchedAt: number }> {
  const { includeBlurPlaceholders = false, ...fetchOptions } = options;

  try {
    // getConfig() can throw if env vars are missing - handle gracefully
    const { baseUrl, apiKey } = getConfig();
    const items = await fetchAbsLibraryItems(fetchOptions);
    const bookListItems = absItemsToBookListItems(items, { baseUrl, apiKey });

    if (includeBlurPlaceholders) {
      const results = await Promise.allSettled(
        bookListItems.map(async book => {
          if (book.coverUrl) {
            book.coverBlurDataURL = await generateBookCoverBlur(book.coverUrl);
          }
        }),
      );
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.warn(`[AudioBookShelf] Blur placeholder failed for book list item index ${index}:`, result.reason);
        }
      });
    }

    // Keep a snapshot so detail pages can fall back to last-known-good data
    cacheSnapshot(absItemsToBooks(items, { baseUrl, apiKey }));

    return { books: bookListItems, isFallback: false, fetchedAt: Date.now() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "AudioBookShelf book list fetch failed, considering fallback snapshot",
      { error: message },
      { category: "Books" },
    );

    // Try in-memory snapshot first
    const snapshotBooks = getSnapshotBooks(SNAPSHOT_TTL_MS);
    if (snapshotBooks) {
      const books = snapshotBooks.map(({ id, title, authors, coverUrl, coverBlurDataURL }) => ({
        id,
        title,
        authors,
        coverUrl,
        coverBlurDataURL,
      }));
      return { books, isFallback: true, fetchedAt: lastBooksSnapshot?.fetchedAt ?? Date.now() };
    }

    // If no snapshot available, return empty array instead of throwing
    // This allows the page to render with an "unavailable" state
    envLogger.log(
      "AudioBookShelf unavailable and no snapshot - returning empty books list",
      { error: message },
      { category: "Books" },
    );
    return { books: [], isFallback: true, fetchedAt: Date.now() };
  }
}

/**
 * Backwards-compatible wrapper that returns only the list.
 */
export async function fetchBookListItems(
  options: FetchAbsLibraryItemsOptions & { includeBlurPlaceholders?: boolean } = {},
): Promise<BookListItem[]> {
  const result = await fetchBookListItemsWithFallback(options);
  return result.books;
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
      // Use time-based revalidation instead of no-store to avoid static-to-dynamic error
      next: { revalidate: 300 },
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

/**
 * Fetch a single book by ID with fallback to the in-memory snapshot.
 */
export async function fetchBookByIdWithFallback(
  id: string,
  options: { includeBlurPlaceholder?: boolean; allowStale?: boolean } = {},
): Promise<{ book: Book | null; isFallback: boolean }> {
  const { allowStale = true, ...rest } = options;
  try {
    const book = await fetchBookById(id, rest);
    if (book) {
      upsertBookIntoSnapshot(book);
      return { book, isFallback: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "AudioBookShelf single-book fetch failed, considering fallback snapshot",
      { error: message, id },
      { category: "Books" },
    );
  }

  const cached = allowStale ? getSnapshotBookById(id, SNAPSHOT_TTL_MS) : null;
  if (cached) {
    return { book: cached, isFallback: true };
  }

  return { book: null, isFallback: false };
}
