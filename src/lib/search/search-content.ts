/**
 * Search Content Function
 *
 * Generic search function that filters items based on a query.
 * Uses MiniSearch for fuzzy matching when available, falls back to substring search.
 *
 * @module lib/search/search-content
 */

import type MiniSearch from "minisearch";
import type { ScoredResult } from "@/types/search";
import { embedTextsWithEndpointCompatibleModel } from "@/lib/ai/openai-compatible/embeddings-client";
import { resolveDefaultEndpointCompatibleEmbeddingConfig } from "@/lib/ai/openai-compatible/feature-config";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";

/**
 * Generic search function that filters items based on a query.
 * Uses MiniSearch for fuzzy matching when available, falls back to substring search.
 * Returns items with relevance scores for proper ranking.
 *
 * @template T - The document type being searched
 * @param items - Array of items to search
 * @param query - Search query string
 * @param getSearchableFields - Function to extract searchable text from an item
 * @param getExactMatchField - Optional function to get field for exact matching
 * @param miniSearchIndex - Optional pre-built MiniSearch index
 * @param getItemId - Optional function to extract ID from item (defaults to item.id)
 * @returns Filtered array of items with scores, sorted by relevance
 *
 * @example
 * ```typescript
 * const results = searchContent(
 *   investments,
 *   "tech startup",
 *   (inv) => [inv.name, inv.description, inv.type],
 *   (inv) => inv.name,
 *   investmentsIndex
 * );
 * ```
 */
export function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null,
  getItemId?: (item: T) => string,
): ScoredResult<T>[] {
  // Sanitize the query first
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return items.map((item) => ({ item, score: 0 }));

  // Helper to extract item ID
  const extractId = (item: T): string => {
    if (getItemId) return getItemId(item);
    const itemWithId = item as T & { id?: string | number; name?: string; slug?: string };
    return String(itemWithId.id ?? itemWithId.name ?? itemWithId.slug ?? item);
  };

  // If we have a MiniSearch index, use it for fuzzy search
  if (miniSearchIndex) {
    try {
      const searchResults = miniSearchIndex.search(sanitizedQuery, {
        prefix: true, // Allow prefix matching for autocomplete-like behavior
        fuzzy: 0.2, // Allow typos (20% edit distance)
        boost: {
          // Boost exact matches
          exactMatch: 2,
        },
        combineWith: "OR", // Any term can match; MiniSearch scoring ranks multi-term hits higher
      });

      // Reuse pattern from searchBookmarks(): capture scores in a Map
      const resultIds = new Set(searchResults.map((r) => String(r.id)));
      const scoreById = new Map(searchResults.map((r) => [String(r.id), r.score ?? 0] as const));

      return items
        .filter((item) => resultIds.has(extractId(item)))
        .map((item) => ({
          item,
          score: scoreById.get(extractId(item)) ?? 0,
        }))
        .toSorted((a, b) => b.score - a.score);
    } catch (error) {
      envLogger.log(
        "MiniSearch failed, falling back to substring search",
        { error: String(error) },
        { category: "Search" },
      );
      // Fall through to substring search
    }
  }

  // Fallback: Original substring search implementation with basic scoring
  const searchTerms = sanitizedQuery.split(/\s+/).filter(Boolean);

  return items
    .filter((item) => {
      // First try exact match if exact match field is provided
      if (getExactMatchField) {
        const exactField = getExactMatchField(item);
        if (exactField.toLowerCase() === sanitizedQuery) {
          return true;
        }
      }

      // Combine all searchable fields into one long string for better matching
      const allContentText = getSearchableFields(item)
        .filter((field): field is string => typeof field === "string" && field.length > 0)
        .join(" ")
        .toLowerCase();

      // Check if all search terms exist in the combined text
      return searchTerms.every((term) => allContentText.includes(term));
    })
    .map((item) => {
      // Calculate a basic relevance score for substring matches
      const exactField = getExactMatchField?.(item)?.toLowerCase() ?? "";
      if (exactField === sanitizedQuery) {
        return { item, score: 1.0 }; // Exact match = highest score
      }
      // Partial matches get a lower score
      return { item, score: 0.5 };
    });
}

const DEFAULT_VECTOR_WEIGHT = 0.45;
const DEFAULT_KEYWORD_WEIGHT = 0.55;
const DEFAULT_CANDIDATE_LIMIT = 24;
const DEFAULT_TIMEOUT_MS = 4_000;

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) {
      return 0;
    }
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function normalizeScores(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) {
    return values.map(() => 1);
  }

  return values.map((value) => (value - min) / (max - min));
}

export async function rerankScoredResultsWithEmbeddings<T>(options: {
  query: string;
  scoredResults: ScoredResult<T>[];
  getRerankText: (item: T) => string;
  logContext: string;
  candidateLimit?: number;
  timeoutMs?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  /** Precomputed query vector to skip embedding the query in the batched call. */
  queryEmbedding?: number[];
}): Promise<ScoredResult<T>[]> {
  const sanitizedQuery = sanitizeSearchQuery(options.query);
  if (!sanitizedQuery) {
    return options.scoredResults;
  }
  if (process.env.NODE_ENV !== "production") {
    return options.scoredResults;
  }

  const embeddingConfig = resolveDefaultEndpointCompatibleEmbeddingConfig();
  const MIN_RERANK_CANDIDATES = 2;
  if (!embeddingConfig || options.scoredResults.length < MIN_RERANK_CANDIDATES) {
    return options.scoredResults;
  }

  const candidateLimit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const candidates = options.scoredResults.slice(0, candidateLimit);
  const texts = candidates.map(({ item }) => options.getRerankText(item).trim());
  if (texts.some((text) => text.length === 0)) {
    return options.scoredResults;
  }

  const precomputedQueryVector = options.queryEmbedding;
  const batchInput = precomputedQueryVector ? texts : [sanitizedQuery, ...texts];

  try {
    const vectors = await embedTextsWithEndpointCompatibleModel({
      config: embeddingConfig,
      input: batchInput,
      tier: "production-z",
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    const queryVector = precomputedQueryVector ?? vectors[0];
    if (!queryVector) {
      return options.scoredResults;
    }
    const candidateVectorOffset = precomputedQueryVector ? 0 : 1;

    const keywordScores = normalizeScores(candidates.map((candidate) => candidate.score));
    const vectorScores = normalizeScores(
      candidates.map((_, index) =>
        cosineSimilarity(queryVector, vectors[index + candidateVectorOffset] ?? []),
      ),
    );

    const keywordWeight = options.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;
    const vectorWeight = options.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;
    const reranked = candidates.map((candidate, index) => ({
      item: candidate.item,
      score:
        (keywordScores[index] ?? 0) * keywordWeight + (vectorScores[index] ?? 0) * vectorWeight,
    }));

    return [
      ...reranked.toSorted((a, b) => b.score - a.score),
      ...options.scoredResults.slice(candidateLimit),
    ];
  } catch (error) {
    envLogger.log(
      `${options.logContext} hybrid rerank failed; keeping keyword order`,
      { error: error instanceof Error ? error.message : String(error) },
      { category: "Search" },
    );
    return options.scoredResults;
  }
}
