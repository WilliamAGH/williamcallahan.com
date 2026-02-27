/**
 * Query embedding utility for hybrid search.
 *
 * Shared helper that embeds a search query string into a vector
 * for use in pgvector semantic search CTEs. Used by all domain-specific
 * hybrid search functions.
 *
 * @module db/queries/query-embedding
 */

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
 */
export async function buildQueryEmbedding(
  query: string,
  logContext: string,
): Promise<number[] | undefined> {
  const embeddingConfig = resolveDefaultEndpointCompatibleEmbeddingConfig();
  if (!embeddingConfig) {
    return undefined;
  }

  try {
    const vectors = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: [query],
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
    return undefined;
  }
}
