/**
 * Hybrid Search — Books & Blog Posts
 *
 * 3-CTE pattern: FTS (ts_rank_cd) + trigram (pg_trgm) + pgvector cosine.
 * Falls back to FTS-only when no embedding is provided.
 *
 * @module db/queries/hybrid-search-books-blog
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import {
  FTS_WEIGHT,
  TRIGRAM_WEIGHT,
  VECTOR_WEIGHT,
  KEYWORD_CANDIDATE_LIMIT,
  SEMANTIC_CANDIDATE_LIMIT,
  DEFAULT_LIMIT,
} from "./hybrid-search-config";
import type { BookSearchResult, BlogPostSearchResult } from "@/types/db/hybrid-search";

// ─── Books ──────────────────────────────────────

export async function hybridSearchBooks(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<BookSearchResult[]> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tsQuery = sql`websearch_to_tsquery('english', ${trimmed})`;

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    const vecLit = `[${embedding.join(",")}]`;
    const castVec = sql.raw(`'${vecLit}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`);

    const rows = await db.execute<{
      id: string;
      title: string;
      slug: string;
      authors: string[] | null;
      description: string | null;
      cover_url: string | null;
      hybrid_score: number;
    }>(sql`
      WITH keyword_results AS (
        SELECT id,
          ts_rank_cd(search_vector, ${tsQuery}) AS fts_score,
          similarity(title, ${trimmed}) AS trgm_score
        FROM books
        WHERE search_vector @@ ${tsQuery} OR title % ${trimmed}
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT entity_id AS id,
          1.0 - (qwen_4b_fp16_embedding <=> ${castVec}) AS vec_score
        FROM embeddings
        WHERE domain = 'book' AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${castVec}
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT COALESCE(k.id, s.id) AS id,
          COALESCE(k.fts_score, 0) * ${FTS_WEIGHT}
            + COALESCE(k.trgm_score, 0) * ${TRIGRAM_WEIGHT}
            + COALESCE(s.vec_score, 0) * ${VECTOR_WEIGHT} AS score
        FROM keyword_results k FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT b.id, b.title, b.slug, b.authors, b.description, b.cover_url,
             c.score AS hybrid_score
      FROM combined c JOIN books b ON b.id = c.id
      ORDER BY c.score DESC LIMIT ${limit}
    `);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      authors: r.authors,
      description: r.description,
      coverUrl: r.cover_url,
      score: Number(r.hybrid_score),
    }));
  }

  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    authors: string[] | null;
    description: string | null;
    cover_url: string | null;
    fts_score: number;
  }>(sql`
    SELECT id, title, slug, authors, description, cover_url,
      ts_rank_cd(search_vector, ${tsQuery}) AS fts_score
    FROM books
    WHERE search_vector @@ ${tsQuery} OR title % ${trimmed}
    ORDER BY fts_score DESC LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    authors: r.authors,
    description: r.description,
    coverUrl: r.cover_url,
    score: Number(r.fts_score),
  }));
}

// ─── Blog Posts ─────────────────────────────────

export async function hybridSearchBlogPosts(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<BlogPostSearchResult[]> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tsQuery = sql`websearch_to_tsquery('english', ${trimmed})`;

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    const vecLit = `[${embedding.join(",")}]`;
    const castVec = sql.raw(`'${vecLit}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`);

    const rows = await db.execute<{
      id: string;
      title: string;
      slug: string;
      excerpt: string | null;
      author_name: string;
      tags: string[] | null;
      published_at: string;
      hybrid_score: number;
    }>(sql`
      WITH keyword_results AS (
        SELECT id,
          ts_rank_cd(search_vector, ${tsQuery}) AS fts_score,
          similarity(title, ${trimmed}) AS trgm_score
        FROM blog_posts
        WHERE draft = false
          AND (search_vector @@ ${tsQuery} OR title % ${trimmed})
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT entity_id AS id,
          1.0 - (qwen_4b_fp16_embedding <=> ${castVec}) AS vec_score
        FROM embeddings
        WHERE domain = 'blog' AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${castVec}
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT COALESCE(k.id, s.id) AS id,
          COALESCE(k.fts_score, 0) * ${FTS_WEIGHT}
            + COALESCE(k.trgm_score, 0) * ${TRIGRAM_WEIGHT}
            + COALESCE(s.vec_score, 0) * ${VECTOR_WEIGHT} AS score
        FROM keyword_results k FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT bp.id, bp.title, bp.slug, bp.excerpt, bp.author_name, bp.tags,
             bp.published_at, c.score AS hybrid_score
      FROM combined c JOIN blog_posts bp ON bp.id = c.id
      WHERE bp.draft = false
      ORDER BY c.score DESC LIMIT ${limit}
    `);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      authorName: r.author_name,
      tags: r.tags,
      publishedAt: r.published_at,
      score: Number(r.hybrid_score),
    }));
  }

  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    author_name: string;
    tags: string[] | null;
    published_at: string;
    fts_score: number;
  }>(sql`
    SELECT id, title, slug, excerpt, author_name, tags, published_at,
      ts_rank_cd(search_vector, ${tsQuery}) AS fts_score
    FROM blog_posts
    WHERE draft = false
      AND (search_vector @@ ${tsQuery} OR title % ${trimmed})
    ORDER BY fts_score DESC LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt,
    authorName: r.author_name,
    tags: r.tags,
    publishedAt: r.published_at,
    score: Number(r.fts_score),
  }));
}
