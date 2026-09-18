/**
 * Server-side blog post search via hybrid PostgreSQL (FTS + trigram + pgvector).
 *
 * @module lib/blog/server-search
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly();

import type { SearchResult } from "@/types/schemas/search";
import type { QueryEmbeddingContext } from "@/types/search";
import { sanitizeSearchQuery } from "../validators/search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { hybridSearchBlogPosts } from "@/lib/db/queries/hybrid-search-books-blog";

const SEARCH_LIMIT = 50;

/**
 * Search blog posts via hybrid PostgreSQL search.
 * Rows arrive in reciprocal-rank order from SQL; that order is returned as-is.
 */
export async function searchBlogPostsServerSide(
  query: string,
  context?: QueryEmbeddingContext,
): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBlogPosts]", context);
  const rows = await hybridSearchBlogPosts({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  return rows.map((r) => ({
    id: r.id,
    type: "blog-post" as const,
    title: r.title,
    description: r.excerpt ?? undefined,
    url: `/blog/${r.slug}`,
    score: r.score,
  }));
}
