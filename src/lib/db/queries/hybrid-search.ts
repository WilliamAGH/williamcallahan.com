/**
 * Hybrid Search Query (FTS + Trigram + pgvector)
 *
 * Three-layer search combining:
 *   1. Full-text search (tsvector + websearch_to_tsquery) — weighted by field
 *   2. Trigram similarity (pg_trgm) — fuzzy title matching
 *   3. Semantic similarity (pgvector halfvec cosine) — embedding-based
 *
 * Layers 1+2 run when a text query is provided.
 * Layer 3 runs when an embedding vector is provided.
 * Keyword and semantic candidates are merged with reciprocal rank fusion
 * (see hybrid-search-config); ties go to the row with keyword evidence.
 *
 * @module db/queries/hybrid-search
 */

import { inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { bookmarks } from "@/lib/db/schema/bookmarks";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import { thoughts } from "@/lib/db/schema/thoughts";
import {
  mapBookmarkSelectToUnifiedBookmark,
  mapBookmarkSelectsToUnifiedBookmarks,
} from "@/lib/db/bookmark-record-mapper";
import type { BookmarkFtsSearchHit } from "@/types/db/bookmarks";

import {
  FTS_WEIGHT,
  TRIGRAM_WEIGHT,
  RRF_K,
  RRF_RANKER_COUNT,
  KEYWORD_CANDIDATE_LIMIT,
  SEMANTIC_CANDIDATE_LIMIT,
  DEFAULT_LIMIT,
} from "./hybrid-search-config";

/**
 * Full hybrid search: FTS + trigram + pgvector semantic similarity.
 * Falls back to FTS-only when no embedding is provided.
 */
export async function hybridSearchBookmarks(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<BookmarkFtsSearchHit[]> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;

  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return [];
  }

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    return hybridSearchWithEmbedding(normalizedQuery, embedding, limit);
  }

  return keywordOnlySearch(normalizedQuery, limit);
}

async function hybridSearchWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
): Promise<BookmarkFtsSearchHit[]> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;

  const rows = await db.execute<{ id: string; hybrid_score: number }>(sql`
    WITH keyword_results AS (
      SELECT id,
          row_number() OVER (ORDER BY
            ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
              + word_similarity(${query}, title) * ${TRIGRAM_WEIGHT} DESC, id DESC) AS keyword_rank
      FROM bookmarks
      WHERE search_vector @@ ${tsQuery}
         OR ${query} <% title
      ORDER BY keyword_rank
      LIMIT ${KEYWORD_CANDIDATE_LIMIT}
    ),
    semantic_results AS (
      SELECT e.entity_id AS id,
        row_number() OVER (ORDER BY e.qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}, e.entity_id) AS semantic_rank
      FROM embeddings e
      JOIN bookmarks existing_bookmark ON existing_bookmark.id = e.entity_id
      WHERE e.domain = 'bookmark'
        AND e.qwen_4b_fp16_embedding IS NOT NULL
      ORDER BY e.qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}, e.entity_id
      LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
    ),
    combined AS (
      SELECT
        COALESCE(k.id, s.id) AS id,
          k.keyword_rank,
        COALESCE(1.0 / (${RRF_K} + k.keyword_rank), 0)
            + COALESCE(1.0 / (${RRF_K} + s.semantic_rank), 0) AS score
      FROM keyword_results k
      FULL OUTER JOIN semantic_results s ON k.id = s.id
    )
    SELECT b.id, c.score AS hybrid_score
    FROM combined c
    JOIN bookmarks b ON b.id = c.id
    ORDER BY c.score DESC, c.keyword_rank NULLS LAST, c.id
    LIMIT ${limit}
  `);

  return hydrateScoredBookmarks(
    rows.map((row) => ({ id: row.id, score: Number(row.hybrid_score) })),
  );
}

async function hydrateScoredBookmarks(
  scoredIds: ReadonlyArray<{ id: string; score: number }>,
): Promise<BookmarkFtsSearchHit[]> {
  if (scoredIds.length === 0) return [];

  const bookmarkRows = await db
    .select()
    .from(bookmarks)
    .where(
      inArray(
        bookmarks.id,
        scoredIds.map(({ id }) => id),
      ),
    );

  const bookmarkById = new Map(
    mapBookmarkSelectsToUnifiedBookmarks(bookmarkRows).map((bookmark) => [bookmark.id, bookmark]),
  );

  return scoredIds.map(({ id, score }) => {
    const bookmark = bookmarkById.get(id);
    if (!bookmark) {
      throw new Error(`Failed to hydrate ranked bookmark ${id}`);
    }
    return { bookmark, score };
  });
}

async function keywordOnlySearch(query: string, limit: number): Promise<BookmarkFtsSearchHit[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;
  const keywordScore = sql<number>`${RRF_RANKER_COUNT} * 1.0 / (${RRF_K} + row_number() OVER (ORDER BY ts_rank_cd(${bookmarks.searchVector}, ${tsQuery}) * ${FTS_WEIGHT}
    + word_similarity(${query}, ${bookmarks.title}) * ${TRIGRAM_WEIGHT} DESC, ${bookmarks.id} DESC))`;

  const rows = await db
    .select({
      bookmark: bookmarks,
      score: keywordScore,
    })
    .from(bookmarks)
    .where(sql`${bookmarks.searchVector} @@ ${tsQuery} OR ${query} <% ${bookmarks.title}`)
    .orderBy(sql`${keywordScore} DESC`)
    .limit(limit);

  return rows.map((row) => ({
    bookmark: mapBookmarkSelectToUnifiedBookmark(row.bookmark),
    score: Number(row.score),
  }));
}

/**
 * Semantic-only search using pgvector cosine similarity.
 * Useful for "find similar bookmarks" without a text query.
 */
export async function semanticSearchBookmarks(
  embedding: number[],
  limit: number = DEFAULT_LIMIT,
): Promise<BookmarkFtsSearchHit[]> {
  if (embedding.length !== CONTENT_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${CONTENT_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    );
  }

  const vectorLiteral = `[${embedding.join(",")}]`;

  const idRows = await db.execute<{
    entity_id: string;
    vec_score: number;
  }>(sql`
    SELECT e.entity_id,
      1.0 - (e.qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}) AS vec_score
    FROM embeddings e
    JOIN bookmarks existing_bookmark ON existing_bookmark.id = e.entity_id
    WHERE e.domain = 'bookmark'
      AND e.qwen_4b_fp16_embedding IS NOT NULL
    ORDER BY e.qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}
    LIMIT ${limit}
  `);

  if (idRows.length === 0) return [];

  return hydrateScoredBookmarks(
    idRows.map((row) => ({ id: row.entity_id, score: Number(row.vec_score) })),
  );
}

export async function hybridSearchThoughts(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<
  Array<{
    id: string;
    slug: string;
    title: string;
    content: string;
    category: string | null;
    tags: string[] | null;
    createdAt: number;
    updatedAt: number | null;
    score: number;
  }>
> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return [];
  }

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    const vectorLiteral = `[${embedding.join(",")}]`;
    const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`;

    const rows = await db.execute<{
      id: string;
      slug: string;
      title: string;
      content: string;
      category: string | null;
      tags: string[] | null;
      created_at: number;
      updated_at: number | null;
      hybrid_score: number;
    }>(sql`
      WITH keyword_results AS (
        SELECT id,
          row_number() OVER (ORDER BY
            ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
              + word_similarity(${normalizedQuery}, title) * ${TRIGRAM_WEIGHT} DESC, id DESC) AS keyword_rank
        FROM thoughts
        WHERE draft = false
          AND (search_vector @@ ${tsQuery} OR ${normalizedQuery} <% title)
        ORDER BY keyword_rank
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT entity_id AS id,
          row_number() OVER (ORDER BY qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}, entity_id) AS semantic_rank
        FROM embeddings
        WHERE domain = 'thought'
          AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`)}, entity_id
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT
          COALESCE(k.id, s.id) AS id,
          k.keyword_rank,
          COALESCE(1.0 / (${RRF_K} + k.keyword_rank), 0)
            + COALESCE(1.0 / (${RRF_K} + s.semantic_rank), 0) AS score
        FROM keyword_results k
        FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT t.id, t.slug, t.title, t.content, t.category, t.tags, t.created_at, t.updated_at, c.score AS hybrid_score
      FROM combined c
      JOIN thoughts t ON t.id = c.id
      WHERE t.draft = false
      ORDER BY c.score DESC, c.keyword_rank NULLS LAST, c.id
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      content: row.content,
      category: row.category,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      score: Number(row.hybrid_score),
    }));
  }

  const tsQuery = sql`websearch_to_tsquery('english', ${normalizedQuery})`;
  const keywordScore = sql<number>`${RRF_RANKER_COUNT} * 1.0 / (${RRF_K} + row_number() OVER (ORDER BY ts_rank_cd(${thoughts.searchVector}, ${tsQuery}) * ${FTS_WEIGHT}
    + word_similarity(${normalizedQuery}, ${thoughts.title}) * ${TRIGRAM_WEIGHT} DESC, ${thoughts.id} DESC))`;
  const rows = await db
    .select({
      id: thoughts.id,
      slug: thoughts.slug,
      title: thoughts.title,
      content: thoughts.content,
      category: thoughts.category,
      tags: thoughts.tags,
      createdAt: thoughts.createdAt,
      updatedAt: thoughts.updatedAt,
      score: keywordScore,
    })
    .from(thoughts)
    .where(
      sql`${thoughts.draft} = false AND (${thoughts.searchVector} @@ ${tsQuery} OR ${normalizedQuery} <% ${thoughts.title})`,
    )
    .orderBy(sql`${keywordScore} DESC`)
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    score: Number(row.score),
  }));
}
