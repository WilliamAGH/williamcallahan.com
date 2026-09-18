/**
 * Thoughts Search (Hybrid BM25 + pgvector)
 * @module lib/search/searchers/thoughts-search
 */

import type { SearchResult } from "@/types/schemas/search";
import type { QueryEmbeddingContext } from "@/types/search";
import { hybridSearchThoughts } from "@/lib/db/queries/hybrid-search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { sanitizeSearchQuery } from "@/lib/validators/search";

const SEARCH_LIMIT = 24;

const trimContent = (content: string): string =>
  content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();

export async function searchThoughts(
  query: string,
  context?: QueryEmbeddingContext,
): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) {
    return [];
  }

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchThoughts]", context);
  const rows = await hybridSearchThoughts({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  return rows.map((row) => ({
    id: row.id,
    type: "page",
    title: row.title,
    description: trimContent(row.content).slice(0, 180),
    url: `/thoughts/${row.slug}`,
    score: row.score,
  }));
}
