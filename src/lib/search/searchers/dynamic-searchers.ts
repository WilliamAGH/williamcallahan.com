/**
 * Dynamic Content Search Functions
 *
 * Hybrid PostgreSQL search (FTS + trigram + pgvector) for bookmarks and books.
 *
 * @module lib/search/searchers/dynamic-searchers
 */

import type { SearchResult } from "@/types/schemas/search";
import type { QueryEmbeddingContext } from "@/types/search";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { hybridSearchBookmarks } from "@/lib/db/queries/hybrid-search";
import { hybridSearchBooks } from "@/lib/db/queries/hybrid-search-books-blog";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { getBooksIndex } from "@/lib/search/loaders/dynamic-content";
import { envLogger } from "@/lib/utils/env-logger";

const SEARCH_LIMIT = 50;

/**
 * Search bookmarks via hybrid PostgreSQL (FTS + trigram + pgvector).
 */
export async function searchBookmarks(
  query: string,
  context?: QueryEmbeddingContext,
): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBookmarks]", context);
  const rows = await hybridSearchBookmarks({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  return rows.map(({ bookmark, score }) => ({
    id: bookmark.id,
    type: "bookmark" as const,
    title: bookmark.title,
    description: bookmark.description,
    url: buildBookmarkPath(bookmark.slug),
    score,
  }));
}

async function searchBooksIndex(query: string): Promise<SearchResult[]> {
  const index = await getBooksIndex();
  return index
    .search(query, { prefix: true, fuzzy: 0.2 })
    .slice(0, SEARCH_LIMIT)
    .map((result) => ({
      id: result.id,
      type: "book" as const,
      title: result.title,
      description: result.authors?.join(", "),
      url: `/books/${generateBookSlug(result.title, result.id, result.authors)}`,
      score: result.score,
    }));
}

/**
 * Search books via hybrid PostgreSQL (FTS + trigram + pgvector).
 */
export async function searchBooks(
  query: string,
  context?: QueryEmbeddingContext,
): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  let rows: Awaited<ReturnType<typeof hybridSearchBooks>>;
  try {
    const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBooks]", context);
    rows = await hybridSearchBooks({ query: sanitizedQuery, embedding, limit: SEARCH_LIMIT });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "[searchBooks] Hybrid book search failed; using indexed fallback",
      { error: message },
      { category: "Search" },
    );
    return searchBooksIndex(sanitizedQuery);
  }

  return rows.map((r) => ({
    id: r.id,
    type: "book" as const,
    title: r.title,
    description: r.authors?.join(", "),
    url: `/books/${r.slug}`,
    score: r.score,
  }));
}
