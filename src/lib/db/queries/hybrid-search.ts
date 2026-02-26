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
 * Results are merged with configurable weights.
 *
 * @module db/queries/hybrid-search
 */

import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { bookmarks, BOOKMARK_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/bookmarks";
import { thoughts, THOUGHT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/thoughts";
import {
  mapBookmarkRowToUnifiedBookmark,
  mapBookmarkRowsToUnifiedBookmarks,
} from "@/lib/db/bookmark-record-mapper";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";

const DEFAULT_LIMIT = 20;
const FTS_WEIGHT = 2.0;
const TRIGRAM_WEIGHT = 0.5;
const VECTOR_WEIGHT = 10.0;
const KEYWORD_CANDIDATE_LIMIT = 50;
const SEMANTIC_CANDIDATE_LIMIT = 50;

/**
 * Full hybrid search: FTS + trigram + pgvector semantic similarity.
 * Falls back to FTS-only when no embedding is provided.
 */
export async function hybridSearchBookmarks(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<Array<{ bookmark: UnifiedBookmark; score: number }>> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;

  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) {
    return [];
  }

  if (embedding && embedding.length === BOOKMARK_EMBEDDING_DIMENSIONS) {
    return hybridSearchWithEmbedding(normalizedQuery, embedding, limit);
  }

  return keywordOnlySearch(normalizedQuery, limit);
}

async function hybridSearchWithEmbedding(
  query: string,
  embedding: number[],
  limit: number,
): Promise<Array<{ bookmark: UnifiedBookmark; score: number }>> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;

  const rows = await db.execute<{
    id: string;
    slug: string;
    url: string;
    title: string;
    description: string;
    note: string | null;
    summary: string | null;
    tags: unknown;
    content: unknown;
    assets: unknown;
    logo_data: unknown;
    og_image: string | null;
    og_title: string | null;
    og_description: string | null;
    og_url: string | null;
    og_image_external: string | null;
    og_image_last_fetched_at: string | null;
    og_image_etag: string | null;
    reading_time: number | null;
    word_count: number | null;
    scraped_content_text: string | null;
    archived: boolean;
    is_private: boolean;
    is_favorite: boolean;
    tagging_status: string | null;
    domain: string | null;
    date_bookmarked: string;
    date_published: string | null;
    date_created: string | null;
    modified_at: string | null;
    source_updated_at: string;
    hybrid_score: number;
  }>(sql`
    WITH keyword_results AS (
      SELECT id,
        ts_rank_cd(search_vector, ${tsQuery}) AS fts_score,
        similarity(title, ${query}) AS trgm_score
      FROM bookmarks
      WHERE search_vector @@ ${tsQuery}
         OR title % ${query}
      LIMIT ${KEYWORD_CANDIDATE_LIMIT}
    ),
    semantic_results AS (
      SELECT id,
        1.0 - (qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})`)}) AS vec_score
      FROM bookmarks
      WHERE qwen_4b_fp16_embedding IS NOT NULL
      ORDER BY qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})`)}
      LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
    ),
    combined AS (
      SELECT
        COALESCE(k.id, s.id) AS id,
        COALESCE(k.fts_score, 0) * ${FTS_WEIGHT}
          + COALESCE(k.trgm_score, 0) * ${TRIGRAM_WEIGHT}
          + COALESCE(s.vec_score, 0) * ${VECTOR_WEIGHT} AS score
      FROM keyword_results k
      FULL OUTER JOIN semantic_results s ON k.id = s.id
    )
    SELECT b.*, c.score AS hybrid_score
    FROM combined c
    JOIN bookmarks b ON b.id = c.id
    ORDER BY c.score DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    bookmark: mapBookmarkRowToUnifiedBookmark(row as never),
    score: Number(row.hybrid_score),
  }));
}

async function keywordOnlySearch(
  query: string,
  limit: number,
): Promise<Array<{ bookmark: UnifiedBookmark; score: number }>> {
  const tsQuery = sql`websearch_to_tsquery('english', ${query})`;

  const rows = await db
    .select({
      bookmark: bookmarks,
      score: sql<number>`ts_rank_cd(${bookmarks.searchVector}, ${tsQuery})`,
    })
    .from(bookmarks)
    .where(sql`${bookmarks.searchVector} @@ ${tsQuery}`)
    .orderBy(
      sql`ts_rank_cd(${bookmarks.searchVector}, ${tsQuery}) DESC`,
      desc(bookmarks.dateBookmarked),
      desc(bookmarks.id),
    )
    .limit(limit);

  return rows.map((row) => ({
    bookmark: mapBookmarkRowToUnifiedBookmark(row.bookmark),
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
): Promise<Array<{ bookmark: UnifiedBookmark; score: number }>> {
  if (embedding.length !== BOOKMARK_EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding must have ${BOOKMARK_EMBEDDING_DIMENSIONS} dimensions, got ${embedding.length}`,
    );
  }

  const vectorLiteral = `[${embedding.join(",")}]`;

  const rows = await db
    .select({
      bookmark: bookmarks,
      score: sql<number>`1.0 - (${bookmarks.qwen4bFp16Embedding} <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})`)})`,
    })
    .from(bookmarks)
    .where(sql`${bookmarks.qwen4bFp16Embedding} IS NOT NULL`)
    .orderBy(
      sql`${bookmarks.qwen4bFp16Embedding} <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${BOOKMARK_EMBEDDING_DIMENSIONS})`)}`,
    )
    .limit(limit);

  return mapBookmarkRowsToUnifiedBookmarks(rows.map((r) => r.bookmark)).map((b, i) => ({
    bookmark: b,
    score: Number(rows[i]?.score ?? 0),
  }));
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

  if (embedding && embedding.length === THOUGHT_EMBEDDING_DIMENSIONS) {
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
          ts_rank_cd(search_vector, ${tsQuery}) AS fts_score,
          similarity(title, ${normalizedQuery}) AS trgm_score
        FROM thoughts
        WHERE draft = false
          AND (search_vector @@ ${tsQuery} OR title % ${normalizedQuery})
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT id,
          1.0 - (qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${THOUGHT_EMBEDDING_DIMENSIONS})`)}) AS vec_score
        FROM thoughts
        WHERE draft = false
          AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${sql.raw(`'${vectorLiteral}'::halfvec(${THOUGHT_EMBEDDING_DIMENSIONS})`)}
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT
          COALESCE(k.id, s.id) AS id,
          COALESCE(k.fts_score, 0) * ${FTS_WEIGHT}
            + COALESCE(k.trgm_score, 0) * ${TRIGRAM_WEIGHT}
            + COALESCE(s.vec_score, 0) * ${VECTOR_WEIGHT} AS score
        FROM keyword_results k
        FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT t.id, t.slug, t.title, t.content, t.category, t.tags, t.created_at, t.updated_at, c.score AS hybrid_score
      FROM combined c
      JOIN thoughts t ON t.id = c.id
      WHERE t.draft = false
      ORDER BY c.score DESC
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
      score: sql<number>`ts_rank_cd(${thoughts.searchVector}, ${tsQuery})`,
    })
    .from(thoughts)
    .where(sql`${thoughts.draft} = false AND ${thoughts.searchVector} @@ ${tsQuery}`)
    .orderBy(
      sql`ts_rank_cd(${thoughts.searchVector}, ${tsQuery}) DESC`,
      desc(thoughts.createdAt),
      desc(thoughts.id),
    )
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
