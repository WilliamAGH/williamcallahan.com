/**
 * Thoughts Search (Hybrid BM25 + pgvector)
 * @module lib/search/searchers/thoughts-search
 */

import type { SearchResult } from "@/types/schemas/search";
import { PAGE_METADATA } from "@/data/metadata";
import { hybridSearchThoughts } from "@/lib/db/queries/hybrid-search";
import { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import { sanitizeSearchQuery } from "@/lib/validators/search";

const SEARCH_LIMIT = 24;

const trimContent = (content: string): string =>
  content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();

function getThoughtsPageResult(): SearchResult {
  const pageTitle =
    typeof PAGE_METADATA.thoughts.title === "string" ? PAGE_METADATA.thoughts.title : "Thoughts";
  const pageDescription =
    typeof PAGE_METADATA.thoughts.description === "string"
      ? PAGE_METADATA.thoughts.description
      : undefined;

  return {
    id: "thoughts-page",
    type: "page",
    title: pageTitle,
    description: pageDescription,
    url: "/thoughts",
    score: 0.05,
  };
}

export async function searchThoughts(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) {
    return [];
  }

  const embedding = await buildQueryEmbedding(sanitizedQuery, "[searchThoughts]");
  const rows = await hybridSearchThoughts({
    query: sanitizedQuery,
    embedding,
    limit: SEARCH_LIMIT,
  });

  const results: SearchResult[] = rows.map((row) => ({
    id: row.id,
    type: "page",
    title: row.title,
    description: trimContent(row.content).slice(0, 180),
    url: `/thoughts/${row.slug}`,
    score: row.score,
  }));

  if (results.length === 0) {
    return [getThoughtsPageResult()];
  }
  return results;
}
