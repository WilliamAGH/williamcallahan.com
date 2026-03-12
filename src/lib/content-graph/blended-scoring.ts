/**
 * Blended Scoring for Cross-Domain Similarity
 *
 * Canonical adapter over `rankEmbeddingCandidates` so on-demand and pre-computed
 * related-content paths use one scoring implementation.
 *
 * @module content-graph/blended-scoring
 */

import { rankEmbeddingCandidates } from "@/lib/db/queries/embedding-similarity";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import type { SimilarityCandidate, ScoredCandidate } from "@/types/related-content";

export function applyBlendedScoring(
  candidates: SimilarityCandidate[],
  options: {
    sourceDomain: ContentEmbeddingDomain;
    maxPerDomain?: number;
    maxTotal?: number;
    bookmarkQualityById?: ReadonlyMap<
      string,
      { hasDescription: boolean; isFavorite: boolean; hasWordCount: boolean }
    >;
  },
): ScoredCandidate[] {
  return rankEmbeddingCandidates({
    sourceDomain: options.sourceDomain,
    candidates,
    bookmarkQualityById: options.bookmarkQualityById,
    maxPerDomain: options.maxPerDomain,
    maxTotal: options.maxTotal,
  });
}
