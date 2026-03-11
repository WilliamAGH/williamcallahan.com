/**
 * Cross-domain cosine similarity using the unified embeddings table.
 *
 * Single-query HNSW traversal finds nearest neighbors across ALL domains.
 * Replaces the heuristic tag/text matching in content-similarity/.
 *
 * @module db/queries/cross-domain-similarity
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import type { SimilarityCandidate } from "@/types/related-content";

const DEFAULT_SIMILARITY_LIMIT = 30;

function computeTagOverlap(
  sourceTagSet: ReadonlySet<string>,
  candidateTagSet: ReadonlySet<string> | undefined,
): number {
  if (sourceTagSet.size === 0 || !candidateTagSet || candidateTagSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const tagSlug of sourceTagSet) {
    if (candidateTagSet.has(tagSlug)) {
      intersection += 1;
    }
  }

  if (intersection === 0) {
    return 0;
  }

  const unionSize = new Set([...sourceTagSet, ...candidateTagSet]).size;
  return unionSize === 0 ? 0 : intersection / unionSize;
}

async function readCanonicalBookmarkTags(
  bookmarkIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  if (bookmarkIds.length === 0) {
    return new Map();
  }

  const rows = await db.execute<{ bookmark_id: string; canonical_tag_slug: string }>(sql`
    SELECT
      tag_link.bookmark_id,
      coalesce(alias_link.target_tag_slug, tag_link.tag_slug) AS canonical_tag_slug
    FROM bookmark_tag_links AS tag_link
    LEFT JOIN bookmarks_tags_links AS alias_link
      ON alias_link.source_tag_slug = tag_link.tag_slug
      AND alias_link.link_type = 'alias'
    WHERE tag_link.bookmark_id = ANY(${bookmarkIds})
  `);

  const tagsByBookmarkId = new Map<string, Set<string>>();
  for (const row of rows) {
    const existing = tagsByBookmarkId.get(row.bookmark_id);
    if (existing) {
      existing.add(row.canonical_tag_slug);
      continue;
    }
    tagsByBookmarkId.set(row.bookmark_id, new Set([row.canonical_tag_slug]));
  }
  return tagsByBookmarkId;
}

async function attachBookmarkTagOverlap(options: {
  sourceId: string;
  candidates: SimilarityCandidate[];
}): Promise<SimilarityCandidate[]> {
  const bookmarkCandidateIds = options.candidates
    .filter((candidate) => candidate.domain === "bookmark")
    .map((candidate) => candidate.entityId);

  if (bookmarkCandidateIds.length === 0) {
    return options.candidates;
  }

  const tagsByBookmarkId = await readCanonicalBookmarkTags([
    options.sourceId,
    ...new Set(bookmarkCandidateIds),
  ]);
  const sourceTagSet = tagsByBookmarkId.get(options.sourceId);
  if (!sourceTagSet || sourceTagSet.size === 0) {
    return options.candidates;
  }

  return options.candidates.map((candidate) => {
    if (candidate.domain !== "bookmark") {
      return candidate;
    }
    return {
      ...candidate,
      tagOverlap: computeTagOverlap(sourceTagSet, tagsByBookmarkId.get(candidate.entityId)),
    };
  });
}

/**
 * Find nearest neighbors across all domains using stored embeddings.
 *
 * Looks up the source entity's embedding from the embeddings table,
 * then performs a single HNSW-accelerated cosine similarity search
 * excluding the source entity itself.
 */
export async function findSimilarByEntity(options: {
  sourceDomain: ContentEmbeddingDomain;
  sourceId: string;
  limit?: number;
  excludeDomains?: ContentEmbeddingDomain[];
}): Promise<SimilarityCandidate[]> {
  const { sourceDomain, sourceId, limit = DEFAULT_SIMILARITY_LIMIT, excludeDomains } = options;

  // Single query: self-join to get source embedding, then ANN search
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
    WHERE e1.domain = ${sourceDomain}
      AND e1.entity_id = ${sourceId}
      AND NOT (e2.domain = e1.domain AND e2.entity_id = e1.entity_id)
      AND e2.qwen_4b_fp16_embedding IS NOT NULL
      ${excludeDomains && excludeDomains.length > 0 ? sql`AND e2.domain != ALL(${excludeDomains})` : sql``}
    ORDER BY e2.qwen_4b_fp16_embedding <=> e1.qwen_4b_fp16_embedding
    LIMIT ${limit}
  `);

  const candidates = rows.map((r) => ({
    domain: r.domain,
    entityId: r.entity_id,
    title: r.title,
    similarity: Number(r.similarity),
    contentDate: r.content_date,
  }));

  if (sourceDomain === "bookmark") {
    return attachBookmarkTagOverlap({ sourceId, candidates });
  }

  return candidates;
}

/**
 * Check whether a source entity has a stored embedding row.
 *
 * Debug endpoints should distinguish "missing source embedding" from
 * "valid source with zero neighbors".
 */
export async function sourceEmbeddingExists(options: {
  sourceDomain: ContentEmbeddingDomain;
  sourceId: string;
}): Promise<boolean> {
  const { sourceDomain, sourceId } = options;
  const rows = await db.execute<{ exists: number }>(sql`
    SELECT 1 AS exists
    FROM embeddings
    WHERE domain = ${sourceDomain}
      AND entity_id = ${sourceId}
      AND qwen_4b_fp16_embedding IS NOT NULL
    LIMIT 1
  `);

  return rows.length > 0;
}

/**
 * Find nearest neighbors using a pre-computed embedding vector.
 *
 * Use this when you already have the embedding (e.g., from a search query
 * that was just embedded). Avoids the extra DB lookup for the source row.
 */
export async function findSimilarByVector(options: {
  sourceEmbedding: number[];
  excludeDomain?: ContentEmbeddingDomain;
  excludeId?: string;
  limit?: number;
}): Promise<SimilarityCandidate[]> {
  const { sourceEmbedding, excludeDomain, excludeId, limit = DEFAULT_SIMILARITY_LIMIT } = options;

  if (sourceEmbedding.length !== CONTENT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${CONTENT_EMBEDDING_DIMENSIONS} dimensions, got ${sourceEmbedding.length}`,
    );
  }

  const vectorLiteral = `[${sourceEmbedding.join(",")}]`;
  const castVec = sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`);

  const rows = await db.execute<{
    domain: ContentEmbeddingDomain;
    entity_id: string;
    title: string;
    content_date: string | null;
    similarity: number;
  }>(sql`
    SELECT
      domain,
      entity_id,
      title,
      content_date,
      1.0 - (qwen_4b_fp16_embedding <=> ${castVec}) AS similarity
    FROM embeddings
    WHERE qwen_4b_fp16_embedding IS NOT NULL
      ${excludeDomain && excludeId ? sql`AND NOT (domain = ${excludeDomain} AND entity_id = ${excludeId})` : sql``}
    ORDER BY qwen_4b_fp16_embedding <=> ${castVec}
    LIMIT ${limit}
  `);

  return rows.map((r) => ({
    domain: r.domain,
    entityId: r.entity_id,
    title: r.title,
    similarity: Number(r.similarity),
    contentDate: r.content_date,
  }));
}
