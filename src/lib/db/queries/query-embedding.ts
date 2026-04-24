/**
 * Query embedding utility for hybrid search.
 *
 * Shared helper that embeds a search query string into a vector
 * for use in pgvector semantic search CTEs. Used by all domain-specific
 * hybrid search functions.
 *
 * @module db/queries/query-embedding
 */

import type { QueryEmbeddingContext } from "@/types/search";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { envLogger } from "@/lib/utils/env-logger";

const QUERY_EMBEDDING_TIMEOUT_MS = 1_500;

/**
 * Embed a search query for hybrid search semantic layer.
 *
 * Returns undefined (not throws) on failure so hybrid search
 * gracefully falls back to FTS-only.
 *
 * When `context.precomputed` is supplied and has the correct dimensionality,
 * it is returned directly — no HTTP call is made.
 */
export async function buildQueryEmbedding(
  query: string,
  logContext: string,
  context?: QueryEmbeddingContext,
): Promise<number[] | undefined> {
  if (context?.precomputed) {
    if (context.precomputed.length === CONTENT_EMBEDDING_DIMENSIONS) {
      return context.precomputed;
    }
    envLogger.log(
      `${logContext} precomputed query embedding has wrong dimensionality; re-embedding`,
      {
        received: context.precomputed.length,
        expected: CONTENT_EMBEDDING_DIMENSIONS,
      },
      { category: "Search" },
    );
  }

  let embeddingConfig: ReturnType<typeof resolveDefaultEndpointCompatibleEmbeddingConfig> = null;
  try {
    embeddingConfig = resolveDefaultEndpointCompatibleEmbeddingConfig();
  } catch (error) {
    envLogger.log(
      `${logContext} embedding config unavailable; continuing with keyword-only search`,
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    // RC1a: error logged; null signals FTS-only fallback
  }
  if (!embeddingConfig) {
    return undefined;
  }

  try {
    const vectors = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: [query],
      tier: "production-z",
      timeoutMs: QUERY_EMBEDDING_TIMEOUT_MS,
    });
    const vector = vectors[0];
    if (!vector || vector.length !== CONTENT_EMBEDDING_DIMENSIONS) {
      return undefined;
    }
    return vector;
  } catch (error) {
    envLogger.log(
      `${logContext} query embedding failed; continuing with keyword-only search`,
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    // RC1a: error logged; undefined signals FTS-only fallback
  }
  return undefined;
}
