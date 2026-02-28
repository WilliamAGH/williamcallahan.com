import { sql } from "drizzle-orm";

import { db } from "@/lib/db/connection";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import type { ScoredCandidate, SimilarityCandidate } from "@/types/related-content";

const DEFAULT_LIMIT = 30;
const RECENCY_HALF_LIFE_DAYS = 180;

function computeRecencyBoost(contentDate: string | null): number {
  if (!contentDate) {
    return 0.5;
  }

  const parsed = Date.parse(contentDate);
  if (!Number.isFinite(parsed)) {
    return 0.5;
  }

  const ageDays = Math.max(0, (Date.now() - parsed) / (1000 * 60 * 60 * 24));
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function computeDomainDiversityBoost(
  sourceDomain: ContentEmbeddingDomain,
  candidateDomain: ContentEmbeddingDomain,
): number {
  return sourceDomain === candidateDomain ? 0.4 : 1;
}

function computeQualityProxy(input: {
  hasDescription: boolean;
  isFavorite: boolean;
  hasWordCount: boolean;
}): number {
  const signals = [input.hasDescription, input.isFavorite, input.hasWordCount];
  const signalCount = signals.filter(Boolean).length;
  return signalCount / signals.length;
}

export function computeEmbeddingBlendScore(input: {
  similarity: number;
  contentDate: string | null;
  sourceDomain: ContentEmbeddingDomain;
  candidateDomain: ContentEmbeddingDomain;
  hasDescription: boolean;
  isFavorite: boolean;
  hasWordCount: boolean;
}): number {
  const recencyBoost = computeRecencyBoost(input.contentDate);
  const domainDiversityBoost = computeDomainDiversityBoost(
    input.sourceDomain,
    input.candidateDomain,
  );
  const qualityProxy = computeQualityProxy({
    hasDescription: input.hasDescription,
    isFavorite: input.isFavorite,
    hasWordCount: input.hasWordCount,
  });

  return (
    0.7 * input.similarity + 0.1 * recencyBoost + 0.1 * domainDiversityBoost + 0.1 * qualityProxy
  );
}

export function rankEmbeddingCandidates(options: {
  sourceDomain: ContentEmbeddingDomain;
  candidates: SimilarityCandidate[];
  bookmarkQualityById?: ReadonlyMap<
    string,
    { hasDescription: boolean; isFavorite: boolean; hasWordCount: boolean }
  >;
  maxPerDomain?: number;
  maxTotal?: number;
}): ScoredCandidate[] {
  const {
    sourceDomain,
    candidates,
    bookmarkQualityById,
    maxPerDomain = 5,
    maxTotal = 20,
  } = options;
  const scored = candidates
    .map((candidate) => {
      const quality =
        candidate.domain === "bookmark" && bookmarkQualityById
          ? (bookmarkQualityById.get(candidate.entityId) ?? {
              hasDescription: false,
              isFavorite: false,
              hasWordCount: false,
            })
          : {
              hasDescription: candidate.title.trim().length > 0,
              isFavorite: false,
              hasWordCount: false,
            };

      return {
        ...candidate,
        score: computeEmbeddingBlendScore({
          similarity: candidate.similarity,
          contentDate: candidate.contentDate,
          sourceDomain,
          candidateDomain: candidate.domain,
          hasDescription: quality.hasDescription,
          isFavorite: quality.isFavorite,
          hasWordCount: quality.hasWordCount,
        }),
      };
    })
    .toSorted((a, b) => b.score - a.score);

  const domainCounts = new Map<ContentEmbeddingDomain, number>();
  const ranked: ScoredCandidate[] = [];
  for (const candidate of scored) {
    const count = domainCounts.get(candidate.domain) ?? 0;
    if (count >= maxPerDomain) {
      continue;
    }
    domainCounts.set(candidate.domain, count + 1);
    ranked.push(candidate);
    if (ranked.length >= maxTotal) {
      break;
    }
  }

  return ranked;
}

export async function findSimilarByEmbedding(
  domain: ContentEmbeddingDomain,
  entityId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<SimilarityCandidate[]> {
  const sourceRows = await db.execute<{ exists: number }>(sql`
    SELECT 1 AS exists
    FROM embeddings
    WHERE domain = ${domain}
      AND entity_id = ${entityId}
      AND qwen_4b_fp16_embedding IS NOT NULL
    LIMIT 1
  `);
  if (sourceRows.length === 0) {
    return [];
  }

  const rows = await db.execute<{
    domain: ContentEmbeddingDomain;
    entity_id: string;
    title: string;
    content_date: string | null;
    similarity: number;
  }>(sql`
    SELECT
      e2.domain,
      e2.entity_id,
      e2.title,
      e2.content_date,
      1.0 - (e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding) AS similarity
    FROM embeddings e1, embeddings e2
    WHERE e1.domain = ${domain}
      AND e1.entity_id = ${entityId}
      AND e2.qwen_4b_fp16_embedding IS NOT NULL
      AND NOT (e2.domain = e1.domain AND e2.entity_id = e1.entity_id)
    ORDER BY e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding
    LIMIT ${limit}
  `);

  return rows
    .filter((row) => !(row.domain === domain && row.entity_id === entityId))
    .map((row) => ({
      domain: row.domain,
      entityId: row.entity_id,
      title: row.title,
      similarity: Number(row.similarity),
      contentDate: row.content_date,
    }));
}

export async function findRelatedBookmarkIdsForSeeds(options: {
  seedBookmarkIds: string[];
  excludeIds?: readonly string[];
  limit?: number;
  perSeedLimit?: number;
  minSimilarity?: number;
}): Promise<string[]> {
  const {
    seedBookmarkIds,
    excludeIds = [],
    limit = 24,
    perSeedLimit = DEFAULT_LIMIT,
    minSimilarity = 0.72,
  } = options;
  const uniqueSeeds = Array.from(new Set(seedBookmarkIds.filter(Boolean))).slice(0, 3);
  if (uniqueSeeds.length === 0 || limit < 1) {
    return [];
  }

  const excluded = new Set(excludeIds);
  const bestSimilarityById = new Map<string, number>();

  for (const seedId of uniqueSeeds) {
    const candidates = await findSimilarByEmbedding("bookmark", seedId, perSeedLimit);
    for (const candidate of candidates) {
      if (candidate.domain !== "bookmark") {
        continue;
      }
      if (candidate.similarity < minSimilarity || excluded.has(candidate.entityId)) {
        continue;
      }
      const existing = bestSimilarityById.get(candidate.entityId);
      if (existing === undefined || candidate.similarity > existing) {
        bestSimilarityById.set(candidate.entityId, candidate.similarity);
      }
    }
  }

  return Array.from(bestSimilarityById.entries())
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([entityId]) => entityId);
}
