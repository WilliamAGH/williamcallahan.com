/**
 * Blended Scoring for Cross-Domain Similarity
 *
 * Transforms raw pgvector cosine similarity candidates into
 * production-quality ranked results with recency and diversity signals.
 *
 * Score = 0.80 × cosine + 0.10 × recency + 0.10 × quality
 * Diversity enforced via per-domain cap (separate from scoring).
 *
 * @module content-graph/blended-scoring
 */

import type { SimilarityCandidate, ScoredCandidate } from "@/types/related-content";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";

export type { ScoredCandidate } from "@/types/related-content";

const COSINE_WEIGHT = 0.8;
const RECENCY_WEIGHT = 0.1;
const QUALITY_WEIGHT = 0.1;

/** Half-life for recency decay in days. Content 180 days old scores 0.5. */
const RECENCY_HALF_LIFE_DAYS = 180;

/** Neutral recency score when no date is available. */
const NEUTRAL_RECENCY = 0.5;

/**
 * Compute a recency score from 0..1 using exponential decay.
 * Returns NEUTRAL_RECENCY when no date is available.
 */
function computeRecencyScore(contentDate: string | null, now: number): number {
  if (!contentDate) return NEUTRAL_RECENCY;

  const dateMs = Date.parse(contentDate);
  if (!Number.isFinite(dateMs)) return NEUTRAL_RECENCY;

  const ageDays = Math.max(0, (now - dateMs) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

/**
 * Quality signal placeholder (all curated content = 1.0).
 * Can be extended later with domain-specific signals (e.g., word count, completeness).
 */
function computeQualityScore(_candidate: SimilarityCandidate): number {
  return 1.0;
}

/**
 * Apply blended scoring and diversity limits to raw similarity candidates.
 *
 * @param candidates - Raw candidates from findSimilarByEntity / findSimilarByVector
 * @param options.maxPerDomain - Max results per domain (diversity cap). Default 5.
 * @param options.maxTotal - Max total results. Default 20.
 * @returns Scored, sorted, and diversity-capped candidates.
 */
export function applyBlendedScoring(
  candidates: SimilarityCandidate[],
  options?: { maxPerDomain?: number; maxTotal?: number },
): ScoredCandidate[] {
  const { maxPerDomain = 5, maxTotal = 20 } = options ?? {};
  const now = Date.now();

  // Score all candidates
  const scored: ScoredCandidate[] = candidates.map((c) => ({
    ...c,
    score:
      COSINE_WEIGHT * c.similarity +
      RECENCY_WEIGHT * computeRecencyScore(c.contentDate, now) +
      QUALITY_WEIGHT * computeQualityScore(c),
  }));

  // Sort by blended score descending
  scored.sort((a, b) => b.score - a.score);

  // Apply per-domain diversity cap
  const domainCounts = new Map<ContentEmbeddingDomain, number>();
  const diverse: ScoredCandidate[] = [];

  for (const item of scored) {
    const count = domainCounts.get(item.domain) ?? 0;
    if (count >= maxPerDomain) continue;
    domainCounts.set(item.domain, count + 1);
    diverse.push(item);
    if (diverse.length >= maxTotal) break;
  }

  return diverse;
}
