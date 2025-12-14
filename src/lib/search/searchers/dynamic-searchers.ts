/**
 * Dynamic Content Search Functions
 *
 * Search functions for dynamic content types: bookmarks and books.
 * These have more complex logic including error handling, fallback caching,
 * and custom result processing.
 *
 * @module lib/search/searchers/dynamic-searchers
 */

import type { SearchResult, BookmarkIndexItem } from "@/types/search";
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
 * Search bookmarks by query.
 * Complex search with error handling, cached fallback, and special empty-index handling.
 */
export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    devLog("[searchBookmarks] query", { query });

    // Check result cache first
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached && !ServerCacheInstance.shouldRefreshSearch("bookmarks", query)) {
      devLog("[searchBookmarks] results", { count: cached.results.length });
      return cached.results;
    }

    // Get bookmarks index
    let indexData: {
      index: { search: (q: string, opts: object) => Array<{ id: unknown; score?: number; [key: string]: unknown }> };
      bookmarks: Array<BookmarkIndexItem & { slug: string }>;
    };
    try {
      indexData = await getBookmarksIndex();
    } catch (error) {
      console.error(`[searchBookmarks] Failed to get bookmarks index:`, error);
      if (cached && Array.isArray(cached.results)) {
        devLog("[searchBookmarks] returning cached results", { count: cached.results.length });
        return cached.results;
      }
      return [];
    }

    const { index, bookmarks } = indexData;

    // No query? Return empty results (standard REST pattern)
    if (!query) {
      return [];
    }

    // Use MiniSearch for querying
    const sanitizedQuery = sanitizeSearchQuery(query);
    if (!sanitizedQuery) return [];

    const searchResults = index.search(sanitizedQuery, {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 2, description: 1.5 },
      combineWith: "AND",
    });

    // Map search results back to SearchResult format
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
      // Fallback: map directly from search results when no bookmarks array
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

    devLog("[searchBookmarks] results", { count: results.length });

    // CRITICAL: Do NOT cache empty results when the index itself was empty.
    // Only cache if the index was healthy (has documents) - empty search results from a healthy index are valid.
    if (bookmarks.length > 0 || results.length > 0) {
      ServerCacheInstance.setSearchResults("bookmarks", query, results);
    } else if (results.length === 0) {
      envLogger.log(
        "[searchBookmarks] SKIPPING RESULT CACHE: Empty results from empty index - slug mapping likely unavailable",
        { query, indexedBookmarks: bookmarks.length, resultsCount: results.length },
        { category: "Search" },
      );
    }

    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
    // Return cached results if available on error
    const cached = ServerCacheInstance.getSearchResults<SearchResult>("bookmarks", query);
    if (cached && Array.isArray(cached.results)) {
      devLog("[searchBookmarks] returning cached results", { count: cached.results.length });
      return cached.results;
    }
    return [];
  }
}

/**
 * Search books by query.
 */
export async function searchBooks(query: string): Promise<SearchResult[]> {
  devLog("[searchBooks] Query:", query);

  const cached = ServerCacheInstance.getSearchResults<SearchResult>("books", query);
  if (cached && !ServerCacheInstance.shouldRefreshSearch("books", query)) {
    devLog("[searchBooks] Returning cached results", { count: cached.results.length });
    return cached.results;
  }

  const index = await getBooksIndex();
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) {
    devLog("[searchBooks] Empty sanitized query, returning []");
    return [];
  }

  // Log index document count for debugging
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

  // Runtime validation of MiniSearch results
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

  // Map back to stored fields
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
