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

// One call per request now, so a slow inference queue costs at most this once; a
// timeout silently turns the whole request keyword-only, which is the worse outcome.
// A caller with a tighter latency budget than this passes its own.
const QUERY_EMBEDDING_TIMEOUT_MS = 4_000;

/**
 * Embed a search query for hybrid search semantic layer.
 *
 * Returns undefined (not throws) on failure so hybrid search
 * gracefully falls back to FTS-only.
 *
 * When a `context` is supplied the caller already embedded the query once for
 * the whole request: its `precomputed` vector is used as-is, and an absent
 * vector means keyword-only for every domain rather than a retry per domain.
 *
 * `timeoutMs` lets a caller bound the call by its own latency budget; it only
 * applies when no `context` is supplied, since a context needs no request.
 */
export async function buildQueryEmbedding(
  query: string,
  logContext: string,
  context?: QueryEmbeddingContext,
  timeoutMs: number = QUERY_EMBEDDING_TIMEOUT_MS,
): Promise<number[] | undefined> {
  if (context) {
    return context.precomputed;
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
      timeoutMs,
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
