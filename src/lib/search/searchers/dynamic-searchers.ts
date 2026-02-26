/**
 * Dynamic Content Search Functions
 *
 * Search functions for dynamic content types: bookmarks and books.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 *
 * @module lib/search/searchers/dynamic-searchers
 */

import type { SearchResult } from "@/types/search";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { hybridSearchBookmarks } from "@/lib/db/queries/hybrid-search";
import { BOOKMARK_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/bookmarks";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { getBookmarksIndex, getBooksIndex } from "../loaders/dynamic-content";
import { isRecord } from "../serialization";

// Dev log helper
const IS_DEV = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
const devLog = (...args: unknown[]) => {
  if (IS_DEV) console.log("[SearchDev]", ...args);
};
const SEARCH_LIMIT = 50;

function shouldUseHybridBookmarkSearch(): boolean {
  return process.env.NODE_ENV === "production";
}

async function buildBookmarkQueryEmbedding(query: string): Promise<number[] | undefined> {
  const embeddingConfig = resolveDefaultEndpointCompatibleEmbeddingConfig();
  if (!embeddingConfig) {
    return undefined;
  }

  try {
    const vectors = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: [query],
      timeoutMs: 1500,
    });
    const vector = vectors[0];
    if (!vector || vector.length !== BOOKMARK_EMBEDDING_DIMENSIONS) {
      return undefined;
    }
    return vector;
  } catch (error) {
    envLogger.log(
      "Bookmark query embedding failed; continuing with keyword-only hybrid search",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    return undefined;
  }
}

async function tryHybridBookmarkSearch(query: string): Promise<SearchResult[] | null> {
  try {
    const embedding = await buildBookmarkQueryEmbedding(query);
    const rows = await hybridSearchBookmarks({ query, embedding, limit: SEARCH_LIMIT });
    return rows.map(({ bookmark, score }) => ({
      id: bookmark.id,
      type: "bookmark",
      title: bookmark.title,
      description: bookmark.description,
      url: `/bookmarks/${bookmark.slug || bookmark.id}`,
      score,
    }));
  } catch (error) {
    envLogger.log(
      "Hybrid bookmark search failed; falling back to MiniSearch",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    return null;
  }
}

/**
 * Common filler words stripped from bookmark search queries before they hit
 * the MiniSearch index, improving precision by removing noise.
 *
 * Includes pronouns "them", "this", "those" — the same words detected by
 * `ANAPHORA_PATTERN` in `api/ai/chat/[feature]/chat-helpers.ts`.  This is
 * safe because the two mechanisms operate on separate pipelines:
 *   1. Anaphora resolution (chat-helpers) expands the *RAG retrieval query*
 *      by merging the current + previous user message.
 *   2. Stop-word stripping (here) cleans the *MiniSearch query* for the
 *      bookmark index, where bare pronouns would match nothing useful.
 * If these pipelines are ever merged, the pronoun overlap must be revisited.
 */
const BOOKMARK_QUERY_STOP_WORDS = new Set(
  "a about all an are bookmarked bookmark bookmarks do find for from great have i in is link links look me my of on please resource resources saved search show specifically specific them this those to want what you".split(
    " ",
  ),
);

function tokenizeQuery(query: string): string[] {
  return query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function dropBookmarkStopWords(terms: string[]): string[] {
  return terms.filter((term) => !BOOKMARK_QUERY_STOP_WORDS.has(term.toLowerCase()));
}

function runBookmarkSearch(
  index: {
    search: (query: string, options: Record<string, unknown>) => unknown[];
  },
  query: string,
  combineWith: "AND" | "OR",
): unknown[] {
  return index.search(query, {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2, description: 1.5, summary: 1.25, slug: 1.1 },
    combineWith,
  });
}

function executeBookmarkQueryStrategies(
  index: {
    search: (query: string, options: Record<string, unknown>) => unknown[];
  },
  sanitizedQuery: string,
): unknown[] {
  const originalTerms = tokenizeQuery(sanitizedQuery);
  const focusedTerms = dropBookmarkStopWords(originalTerms);
  const focusedQuery = focusedTerms.join(" ");
  const strategies: Array<{ query: string; combineWith: "AND" | "OR" }> = [
    { query: sanitizedQuery, combineWith: "AND" },
  ];

  if (focusedQuery.length > 0 && focusedQuery !== sanitizedQuery) {
    strategies.push({ query: focusedQuery, combineWith: "AND" });
  }

  if (focusedTerms.length > 1) {
    strategies.push({ query: focusedQuery, combineWith: "OR" });
  }

  if (originalTerms.length > 1) {
    strategies.push({ query: sanitizedQuery, combineWith: "OR" });
  }

  for (const strategy of strategies) {
    const hits = runBookmarkSearch(index, strategy.query, strategy.combineWith);
    if (hits.length > 0) return hits;
  }

  return [];
}

function normalizeBookmarkSearchHit(hit: unknown): {
  id: string;
  score: number;
  slug?: string;
  title?: string;
  description?: string;
} | null {
  if (!isRecord(hit)) return null;

  const rawId = hit.id;
  let id: string | null;
  if (typeof rawId === "string") {
    id = rawId;
  } else if (typeof rawId === "number") {
    id = String(rawId);
  } else {
    id = null;
  }
  if (!id) return null;

  return {
    id,
    score: typeof hit.score === "number" ? hit.score : 0,
    slug: typeof hit.slug === "string" ? hit.slug : undefined,
    title: typeof hit.title === "string" ? hit.title : undefined,
    description: typeof hit.description === "string" ? hit.description : undefined,
  };
}

/**
 * Execute bookmark search and cache results. Used for both foreground and background refresh.
 */
async function executeBookmarkSearch(query: string): Promise<SearchResult[]> {
  if (!query) return [];

  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  if (shouldUseHybridBookmarkSearch()) {
    const hybridResults = await tryHybridBookmarkSearch(sanitizedQuery);
    if (hybridResults) {
      return hybridResults;
    }
  }

  const indexData = await getBookmarksIndex();
  const { index, bookmarks } = indexData;

  const searchResults = executeBookmarkQueryStrategies(index, sanitizedQuery)
    .map(normalizeBookmarkSearchHit)
    .filter((hit): hit is NonNullable<typeof hit> => hit !== null);

  const resultIds = new Set(searchResults.map((result) => result.id));
  const scoreById = new Map(searchResults.map((result) => [result.id, result.score] as const));
  let results: SearchResult[];

  if (bookmarks.length > 0) {
    results = bookmarks
      .filter((b) => resultIds.has(b.id))
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
      .map((hit) => {
        const id = hit.id;
        const slug = hit.slug;
        if (!id || !slug) return null;

        return {
          id,
          type: "bookmark" as const,
          title: typeof hit.title === "string" && hit.title.length > 0 ? hit.title : slug,
          description: hit.description ?? "",
          url: `/bookmarks/${slug}`,
          score: scoreById.get(id) ?? 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    results = mappedHits.toSorted((a, b) => b.score - a.score);
  }

  // Log empty-index behavior for debugging visibility
  if (bookmarks.length === 0 && results.length === 0) {
    envLogger.log(
      "[searchBookmarks] Empty results from empty index",
      { query, indexedBookmarks: bookmarks.length, resultsCount: results.length },
      { category: "Search" },
    );
  }

  return results;
}

/**
 * Search bookmarks by query.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 */
export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  try {
    devLog("[searchBookmarks] query", { query });
    const results = await executeBookmarkSearch(query);
    devLog("[searchBookmarks] results (fresh)", { count: results.length });
    return results;
  } catch (err) {
    console.error("[searchBookmarks] Unexpected failure:", err);
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
    .map((hit) => {
      if (!isRecord(hit)) return null;
      const id = hit.id;
      if (typeof id !== "string" && typeof id !== "number") return null;
      return {
        id,
        title: typeof hit.title === "string" ? hit.title : undefined,
        authors: Array.isArray(hit.authors)
          ? hit.authors.filter((a): a is string => typeof a === "string")
          : undefined,
        score: typeof hit.score === "number" ? hit.score : undefined,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const scoreById = new Map(searchResultsRaw.map((r) => [String(r.id), r.score ?? 0] as const));

  const results: SearchResult[] = searchResultsRaw.map(({ id, title, authors }) => ({
    id: String(id),
    type: "page",
    title: title ?? "Untitled",
    description: Array.isArray(authors) ? authors.join(", ") : undefined,
    url: `/books/${generateBookSlug(title ?? "", String(id), Array.isArray(authors) ? authors : undefined)}`,
    score: scoreById.get(String(id)) ?? 0,
  }));

  devLog("[searchBooks] Final results:", results.length);
  return results;
}

/**
 * Search books by query.
 * Uses stale-while-revalidate: returns cached results immediately, refreshes in background.
 */
export async function searchBooks(query: string): Promise<SearchResult[]> {
  devLog("[searchBooks] Query:", query);
  return executeBooksSearch(query);
}
