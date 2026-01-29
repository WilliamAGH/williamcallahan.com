/**
 * Dynamic Content Search Functions
 *
 * Search functions for dynamic content types: bookmarks and books.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 *
 * @module lib/search/searchers/dynamic-searchers
 */

import type { SearchResult } from "@/types/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { getBookmarksIndex, getBooksIndex } from "../loaders/dynamic-content";
import { isRecord } from "../serialization";

// Dev log helper
const IS_DEV = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const devLog = (...args: unknown[]) => {
  if (IS_DEV) console.log("[SearchDev]", ...args);
};

/**
 * Track in-flight background refreshes to prevent duplicate work.
 */
const bookmarksRefreshInFlight = new Set<string>();
const booksRefreshInFlight = new Set<string>();

/**
 * Execute bookmark search and cache results. Used for both foreground and background refresh.
 */
async function executeBookmarkSearch(query: string): Promise<SearchResult[]> {
  const indexData = await getBookmarksIndex();
  const { index, bookmarks } = indexData;

  if (!query) return [];

  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const searchResults = index.search(sanitizedQuery, {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2, description: 1.5 },
    combineWith: "AND",
  });

  const resultIds = new Set(searchResults.map(r => String(r.id)));
  const scoreById = new Map(searchResults.map(r => [String(r.id), r.score ?? 0] as const));
  let results: SearchResult[];

  if (bookmarks.length > 0) {
    results = bookmarks
      .filter(b => resultIds.has(b.id))
      .map(
        (b): SearchResult => ({
          id: b.id,
          type: "bookmark" as const,
          title: b.title,
          description: b.description,
          url: `/bookmarks/${b.slug}`,
          score: scoreById.get(b.id) ?? 0,
        }),
      )
      .toSorted((a, b) => b.score - a.score);
  } else {
    const mappedHits = searchResults
      .map(hit => {
        if (!isRecord(hit)) return null;
        const id = typeof hit.id === "string" ? hit.id : typeof hit.id === "number" ? String(hit.id) : null;
        const slug = typeof hit.slug === "string" ? hit.slug : null;
        if (!id || !slug) return null;

        return {
          id,
          type: "bookmark" as const,
          title: typeof hit.title === "string" && hit.title.length > 0 ? hit.title : slug,
          description: typeof hit.description === "string" ? hit.description : "",
          url: `/bookmarks/${slug}`,
          score: typeof hit.score === "number" ? hit.score : (scoreById.get(id) ?? 0),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    results = mappedHits.toSorted((a, b) => b.score - a.score);
  }

  // Only cache if index was healthy (has documents) - empty results from healthy index are valid
  if (bookmarks.length > 0 || results.length > 0) {
    ServerCacheInstance.setSearchResults("bookmarks", query, results);
  } else {
    envLogger.log(
      "[searchBookmarks] SKIPPING RESULT CACHE: Empty results from empty index",
      { query, indexedBookmarks: bookmarks.length, resultsCount: results.length },
      { category: "Search" },
    );
  }

  return results;
}

/**
 * Trigger background refresh for bookmarks search (non-blocking).
 */
function triggerBookmarksBackgroundRefresh(query: string): void {
  if (bookmarksRefreshInFlight.has(query)) return;

  bookmarksRefreshInFlight.add(query);
  void executeBookmarkSearch(query)
    .catch(err => console.error("[SWR] Bookmarks background refresh failed:", err))
    .finally(() => bookmarksRefreshInFlight.delete(query));
}

/**
 * Search bookmarks by query.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 */
export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    devLog("[searchBookmarks] query", { query });

    // Check cache (even stale entries are usable with SWR)
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    const isStale = cached && ServerCacheInstance.shouldRefreshSearch("bookmarks", query);

    // SWR: Return stale cache immediately, trigger background refresh
    if (cached) {
      if (isStale) {
        triggerBookmarksBackgroundRefresh(query);
      }
      devLog("[searchBookmarks] results (cached)", { count: cached.results.length, isStale });
      return cached.results;
    }

    // No cache: must fetch synchronously (cold start)
    const results = await executeBookmarkSearch(query);
    devLog("[searchBookmarks] results (fresh)", { count: results.length });
    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
    // Return cached results if available on error (even if stale)
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached?.results) {
      devLog("[searchBookmarks] returning cached results on error", {
        count: cached.results.length,
      });
      return cached.results;
    }
    return [];
  }
}

/**
 * Execute books search and cache results. Used for both foreground and background refresh.
 */
async function executeBooksSearch(query: string): Promise<SearchResult[]> {
  const index = await getBooksIndex();
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const indexDocCount = index.documentCount;
  devLog("[searchBooks] Index document count:", indexDocCount);

  if (indexDocCount === 0) {
    console.warn("[Search] Books index is empty - no books to search");
    return [];
  }

  const searchResultsUnknown: unknown = index.search(sanitizedQuery, {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2 },
    combineWith: "AND",
  });

  const hits = Array.isArray(searchResultsUnknown) ? searchResultsUnknown : [];
  devLog("[searchBooks] Raw hits from MiniSearch:", hits.length);

  const searchResultsRaw = hits
    .map(hit => {
      if (!isRecord(hit)) return null;
      const id = hit.id;
      if (typeof id !== "string" && typeof id !== "number") return null;
      return {
        id,
        title: typeof hit.title === "string" ? hit.title : undefined,
        authors: Array.isArray(hit.authors) ? hit.authors.filter((a): a is string => typeof a === "string") : undefined,
        score: typeof hit.score === "number" ? hit.score : undefined,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const scoreById = new Map(searchResultsRaw.map(r => [String(r.id), r.score ?? 0] as const));

  const results: SearchResult[] = searchResultsRaw.map(({ id, title, authors }) => ({
    id: String(id),
    type: "page",
    title: title ?? "Untitled",
    description: Array.isArray(authors) ? authors.join(", ") : undefined,
    url: `/books/${generateBookSlug(title ?? "", String(id), Array.isArray(authors) ? authors : undefined)}`,
    score: scoreById.get(String(id)) ?? 0,
  }));

  devLog("[searchBooks] Final results:", results.length);
  ServerCacheInstance.setSearchResults("books", query, results);
  return results;
}

/**
 * Trigger background refresh for books search (non-blocking).
 */
function triggerBooksBackgroundRefresh(query: string): void {
  if (booksRefreshInFlight.has(query)) return;

  booksRefreshInFlight.add(query);
  void executeBooksSearch(query)
    .catch(err => console.error("[SWR] Books background refresh failed:", err))
    .finally(() => booksRefreshInFlight.delete(query));
}

/**
 * Search books by query.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 */
export async function searchBooks(query: string): Promise<SearchResult[]> {
  devLog("[searchBooks] Query:", query);

  // Check cache (even stale entries are usable with SWR)
  const cached = ServerCacheInstance.getSearchResults<SearchResult>("books", query);
  const isStale = cached && ServerCacheInstance.shouldRefreshSearch("books", query);

  // SWR: Return stale cache immediately, trigger background refresh
  if (cached) {
    if (isStale) {
      triggerBooksBackgroundRefresh(query);
    }
    devLog("[searchBooks] Returning cached results", { count: cached.results.length, isStale });
    return cached.results;
  }

  // No cache: must fetch synchronously (cold start)
  return executeBooksSearch(query);
}
