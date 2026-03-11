/**
 * Server-side blog post search via hybrid PostgreSQL (FTS + trigram + pgvector).
 *
 * @module lib/blog/server-search
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly();

import type { SearchResult } from "@/types/schemas/search";
import { sanitizeSearchQuery } from "../validators/search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { hybridSearchBlogPosts } from "@/lib/db/queries/hybrid-search-books-blog";

const SEARCH_LIMIT = 50;

/**
 * Search blog posts via hybrid PostgreSQL search.
 * Results sorted by hybrid score desc, then recency as tiebreaker.
 */
export async function searchBlogPostsServerSide(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return [];

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchBlogPosts]");
  const rows = await hybridSearchBlogPosts({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  return rows
    .map((r) => ({
      id: r.id,
      type: "blog-post" as const,
      title: r.title,
      description: r.excerpt ?? undefined,
      url: `/blog/${r.slug}`,
      score: r.score,
      publishedAt: r.publishedAt,
    }))
    .toSorted((a, b) => {
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      const aDate = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bDate = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bDate - aDate;
    })
    .map(({ publishedAt: _publishedAt, ...rest }) => rest);
}
