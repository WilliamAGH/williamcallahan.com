/**
 * Thoughts Search (Hybrid BM25 + pgvector)
 * @module lib/search/searchers/thoughts-search
 */

import type { SearchResult } from "@/types/search";
import { PAGE_METADATA } from "@/data/metadata";
import { hybridSearchThoughts } from "@/lib/db/queries/hybrid-search";
import { THOUGHT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/thoughts";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";

const SEARCH_LIMIT = 24;

const trimContent = (content: string): string =>
  content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\s+/g, " ")
    .trim();

async function buildThoughtQueryEmbedding(query: string): Promise<number[] | undefined> {
  const embeddingConfig = resolveDefaultEndpointCompatibleEmbeddingConfig();
  if (!embeddingConfig) {
    return undefined;
  }

  try {
    const vectors = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: [query],
      timeoutMs: 1_500,
    });
    const vector = vectors[0];
    if (!vector || vector.length !== THOUGHT_EMBEDDING_DIMENSIONS) {
      return undefined;
    }
    return vector;
  } catch (error) {
    envLogger.log(
      "Thought query embedding failed; using BM25-only thought search",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    return undefined;
  }
}

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

  const embedding = await buildThoughtQueryEmbedding(sanitizedQuery);
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
