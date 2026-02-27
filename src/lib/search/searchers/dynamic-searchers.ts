/**
 * Dynamic Content Search Functions
 *
 * Hybrid PostgreSQL search (FTS + trigram + pgvector) for bookmarks and books.
 *
 * @module lib/search/searchers/dynamic-searchers
 */

import type { SearchResult } from "@/types/search";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { hybridSearchBookmarks } from "@/lib/db/queries/hybrid-search";
import { hybridSearchBooks } from "@/lib/db/queries/hybrid-search-books-blog";

const SEARCH_LIMIT = 50;

/**
 * Search bookmarks via hybrid PostgreSQL (FTS + trigram + pgvector).
 */
export async function searchBookmarks(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBookmarks]");
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
    url: `/bookmarks/${bookmark.slug || bookmark.id}`,
    score,
  }));
}

/**
 * Search books via hybrid PostgreSQL (FTS + trigram + pgvector).
 */
export async function searchBooks(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBooks]");
  const rows = await hybridSearchBooks({ query: sanitizedQuery, embedding, limit: SEARCH_LIMIT });

  return rows.map((r) => ({
    id: r.id,
    type: "page" as const,
    title: r.title,
    description: r.authors?.join(", "),
    url: `/books/${r.slug}`,
    score: r.score,
  }));
}
