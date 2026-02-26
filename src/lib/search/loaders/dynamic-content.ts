/**
 * Dynamic Content Index Loaders
 *
 * Index loaders for dynamic content types: bookmarks and books.
 * These have more complex loading logic with memory checks, API fallbacks,
 * and persisted search-index reconstruction.
 *
 * @module lib/search/loaders/dynamic-content
 * @see {@link ../config} for MiniSearch index configurations
 * @see {@link ../constants} for cache keys, TTLs, and persistence flags
 */

import MiniSearch from "minisearch";
import {
  type BookmarkIndexInput,
  type BookmarkIndexItem,
  type SerializedIndex,
} from "@/types/schemas/search";
import type { Book } from "@/types/schemas/book";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { getSerializedSearchIndexArtifact } from "@/lib/db/queries/search-index-artifacts";
import { envLogger } from "@/lib/utils/env-logger";
import logger from "@/lib/utils/logger";
import { prepareDocumentsForIndexing } from "@/lib/utils/search-helpers";
import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { loadIndexFromJSON } from "../index-builder";
import { extractBookmarksFromSerializedIndex } from "../serialization";
import { BOOKMARKS_INDEX_CONFIG, BOOKS_INDEX_CONFIG } from "../config";
import { USE_S3_INDEXES } from "../constants";
import { createIndexWithoutDedup } from "../index-factory";
import { generateFallbackSlug } from "@/lib/bookmarks/slug-helpers";

// Dev log helper (matches original search.ts pattern)
const IS_DEV = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const devLog = (...args: unknown[]) => {
  if (IS_DEV) console.log("[SearchDev]", ...args);
};

// --- Bookmarks ---

/**
 * Build a bookmarks index from raw bookmark data.
 *
 * @param bookmarks - Array of raw bookmarks
 * @returns MiniSearch index for bookmarks
 */
export function buildBookmarksIndex(
  bookmarks: BookmarkIndexInput[],
): MiniSearch<BookmarkIndexItem> {
  // Transform bookmarks for indexing
  const bookmarksForIndex: BookmarkIndexItem[] = [];
  for (const b of bookmarks) {
    const slug = b.slug ?? generateFallbackSlug(b.url, b.id);

    bookmarksForIndex.push({
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      summary: b.summary ?? "",
      tags: Array.isArray(b.tags)
        ? b.tags.map((t) => (typeof t === "string" ? t : t?.name || "")).join("\n")
        : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug,
    });
  }

  return createIndexWithoutDedup(BOOKMARKS_INDEX_CONFIG, bookmarksForIndex);
}

/**
 * Get or build the bookmarks search index.
 * Complex loader with memory checks, API fallback, and persisted artifact reconstruction.
 *
 * @returns Object containing the MiniSearch index and bookmark data for result mapping
 */
export async function getBookmarksIndex(): Promise<{
  index: MiniSearch<BookmarkIndexItem>;
  bookmarks: Array<BookmarkIndexItem & { slug: string }>;
}> {
  devLog("[getBookmarksIndex] Building/Loading bookmarks index. start");

  // CRITICAL: Use bracket notation to prevent Turbopack from inlining NEXT_PHASE at build time
  const PHASE_KEY = "NEXT_PHASE";
  const BUILD_VALUE = "phase-production-build";
  const isBuildPhase = process.env[PHASE_KEY] === BUILD_VALUE;

  if (isBuildPhase) {
    devLog("[getBookmarksIndex] build phase detected, returning empty index");
    return { index: buildBookmarksIndex([]), bookmarks: [] };
  }

  // Fetch bookmarks data
  let bookmarks: BookmarkIndexInput[] = [];
  let persistedBookmarksIndex: SerializedIndex | null = null;

  try {
    const { getBookmarks } = await import("@/lib/bookmarks/service.server");
    const all = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: false,
      skipExternalFetch: false,
      force: false,
    })) as BookmarkIndexInput[];
    bookmarks = all;
    devLog("[getBookmarksIndex] fetched bookmarks via direct import", { count: bookmarks.length });
  } catch (error_) {
    const skipApiFallback = process.env[PHASE_KEY] === BUILD_VALUE;
    if (skipApiFallback) {
      envLogger.log(
        "Direct bookmarks fetch failed during build phase; skipping /api/bookmarks fallback",
        { error: String(error_) },
        { category: "Search" },
      );
      bookmarks = [];
    } else {
      devLog("[getBookmarksIndex] falling back to API fetch");
      envLogger.log(
        "Direct bookmarks fetch failed, falling back to /api/bookmarks",
        { error: String(error_) },
        { category: "Search" },
      );

      const { getBaseUrl } = await import("@/lib/utils/get-base-url");
      const apiUrl = `${getBaseUrl()}/api/bookmarks?limit=10000`;

      const controller = new AbortController();
      const FETCH_TIMEOUT_MS = Number(process.env.SEARCH_BOOKMARKS_TIMEOUT_MS) || 30000;
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let resp: Response | undefined;
      try {
        resp = await fetch(apiUrl, { cache: "no-store", signal: controller.signal });
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
      clearTimeout(timeoutId);

      if (!resp?.ok) {
        throw new Error(
          `Failed to fetch bookmarks: HTTP ${resp?.status ?? "unknown"} ${resp?.statusText ?? ""}`,
          {
            cause: error_,
          },
        );
      }
      const raw = (await resp.json()) as unknown;
      if (Array.isArray(raw)) {
        bookmarks = raw as BookmarkIndexInput[];
      } else if (typeof raw === "object" && raw !== null) {
        const obj = raw as Record<string, unknown>;
        bookmarks = (obj.data ?? obj.bookmarks ?? []) as BookmarkIndexInput[];
      }
      devLog("[getBookmarksIndex] fetched bookmarks via API", { count: bookmarks.length });
    }
  }

  bookmarks = bookmarks || [];

  // Load slug mapping
  const { loadSlugMapping, getSlugForBookmark } = await import("@/lib/bookmarks/slug-manager");
  const { tryGetEmbeddedSlug } = await import("@/lib/bookmarks/slug-helpers");
  const slugMapping = await loadSlugMapping();

  // Try to load index from persisted artifacts
  let bookmarksIndex: MiniSearch<BookmarkIndexItem>;

  if (USE_S3_INDEXES) {
    try {
      const serializedIndex = await getSerializedSearchIndexArtifact("bookmarks");
      if (serializedIndex?.index && serializedIndex.metadata) {
        persistedBookmarksIndex = serializedIndex;
        bookmarksIndex = loadIndexFromJSON<BookmarkIndexItem>(
          serializedIndex,
          BOOKMARKS_INDEX_CONFIG,
        );
        console.log(
          `[Search] Loaded bookmarks index from PostgreSQL (${serializedIndex.metadata.itemCount} items)`,
        );
      } else {
        bookmarksIndex = buildBookmarksIndex(bookmarks);
      }
    } catch (error) {
      console.error("[Search] Error loading bookmarks index from PostgreSQL:", error);
      bookmarksIndex = buildBookmarksIndex(bookmarks);
    }
  } else {
    bookmarksIndex = buildBookmarksIndex(bookmarks);
  }

  // Transform bookmarks for result mapping
  const bookmarksForIndex: Array<BookmarkIndexItem & { slug: string }> = [];

  for (const b of bookmarks) {
    const embedded = tryGetEmbeddedSlug(b);
    let slug = embedded ?? (slugMapping ? getSlugForBookmark(slugMapping, b.id) : null);

    // Generate fallback slug if no embedded or mapped slug exists
    // This ensures consistency with buildBookmarksIndex() which always uses fallback slugs
    if (!slug) {
      slug = generateFallbackSlug(b.url, b.id);
      // WARN level: This is degraded state - bookmark lacks canonical slug mapping
      logger.warn(
        "[Search] DEGRADED: No canonical slug for bookmark, using fallback - consider regenerating slug mapping",
        { id: b.id, title: b.title, url: b.url, fallbackSlug: slug },
      );
    }

    bookmarksForIndex.push({
      id: b.id,
      title: b.title || b.url,
      description: b.description || "",
      summary: b.summary ?? "",
      tags: Array.isArray(b.tags)
        ? b.tags.map((t) => (typeof t === "string" ? t : t?.name || "")).join("\n")
        : "",
      url: b.url,
      author: b.content?.author || "",
      publisher: b.content?.publisher || "",
      slug,
    });
  }

  // Fallback: reconstruct from persisted index if no live data
  if (bookmarksForIndex.length === 0 && bookmarks.length === 0 && persistedBookmarksIndex) {
    const reconstructed = extractBookmarksFromSerializedIndex(persistedBookmarksIndex);
    if (reconstructed.length > 0) {
      bookmarksForIndex.push(...reconstructed);
      devLog("[getBookmarksIndex] using stored fields from persisted index for mapping", {
        reconstructed: reconstructed.length,
        persistedDocuments: persistedBookmarksIndex.metadata.itemCount,
      });
    } else {
      envLogger.log(
        "[Search] Unable to reconstruct bookmarks from persisted index stored fields",
        { itemCount: persistedBookmarksIndex.metadata.itemCount },
        { category: "Search" },
      );
    }
  }

  const result = { index: bookmarksIndex, bookmarks: bookmarksForIndex };

  const persistedIndexCount = persistedBookmarksIndex?.metadata?.itemCount ?? 0;
  devLog("[getBookmarksIndex] index built", {
    indexed: bookmarksForIndex.length,
    sourceBookmarks: bookmarks.length,
    persistedIndexCount,
  });

  return result;
}

// --- Books ---

/**
 * Shared cache for full Book[] data.
 * Called by both getBooksIndex() and getBookGenresWithCounts() to avoid duplicate API calls.
 */
export async function getCachedBooksData(): Promise<Book[]> {
  let books: Book[] = [];
  try {
    devLog("[getCachedBooksData] Fetching full books from AudioBookShelf...");
    books = await fetchBooks();
    devLog("[getCachedBooksData] Fetched books", { count: books.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log("[Search] Failed to fetch books", { error: message }, { category: "Search" });
    console.error("[Search] Books fetch failed:", message);
    return [];
  }

  if (books.length === 0) {
    console.warn("[Search] WARNING: No books returned from AudioBookShelf");
  }

  return books;
}

/**
 * Build a books index from Book data.
 *
 * @param books - Array of books
 * @returns MiniSearch index for books
 */
function buildBooksIndex(books: Book[]): MiniSearch<Book> {
  const booksIndex = new MiniSearch<Book>({
    fields: BOOKS_INDEX_CONFIG.fields,
    storeFields: BOOKS_INDEX_CONFIG.storeFields,
    idField: BOOKS_INDEX_CONFIG.idField,
    searchOptions: {
      boost: BOOKS_INDEX_CONFIG.boost as { [fieldName: string]: number } | undefined,
      fuzzy: BOOKS_INDEX_CONFIG.fuzzy ?? 0.2,
      prefix: true,
    },
    extractField: BOOKS_INDEX_CONFIG.extractField,
  });

  const deduped = prepareDocumentsForIndexing(books, "Books");
  booksIndex.addAll(deduped);
  return booksIndex;
}

/**
 * Get or build the books search index.
 * Uses shared books data cache and persisted artifact fallback.
 */
export async function getBooksIndex(): Promise<MiniSearch<Book>> {
  let booksIndex: MiniSearch<Book>;

  // Try to load from persisted artifacts first
  if (USE_S3_INDEXES) {
    try {
      devLog("[getBooksIndex] Trying to load books index from PostgreSQL...");
      const serializedIndex = await getSerializedSearchIndexArtifact("books");
      if (serializedIndex?.index && serializedIndex.metadata) {
        booksIndex = loadIndexFromJSON<Book>(serializedIndex, BOOKS_INDEX_CONFIG);
        console.log(
          `[Search] Loaded books index from PostgreSQL (${serializedIndex.metadata.itemCount} items)`,
        );
        return booksIndex;
      }
      devLog("[getBooksIndex] Persisted index not found or invalid, falling back to live fetch");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      devLog(
        "[getBooksIndex] PostgreSQL artifact load failed, falling back to live fetch:",
        message,
      );
    }
  }

  const books = await getCachedBooksData();

  if (books.length === 0) {
    return buildBooksIndex([]);
  }

  console.log(`[Search] Building books index with ${books.length} books`);
  return buildBooksIndex(books);
}
