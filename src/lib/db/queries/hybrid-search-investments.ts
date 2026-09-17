/**
 * Hybrid Search — Investments & Projects
 *
 * 3-CTE pattern: FTS (ts_rank_cd) + trigram (pg_trgm) + pgvector cosine.
 * Falls back to FTS-only when no embedding is provided.
 *
 * @module db/queries/hybrid-search-investments
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { CONTENT_EMBEDDING_DIMENSIONS } from "@/lib/db/schema/content-embeddings";
import {
  FTS_WEIGHT,
  TRIGRAM_WEIGHT,
  RRF_K,
  KEYWORD_CANDIDATE_LIMIT,
  SEMANTIC_CANDIDATE_LIMIT,
  DEFAULT_LIMIT,
} from "./hybrid-search-config";
import type { InvestmentSearchResult, ProjectSearchResult } from "@/types/db/hybrid-search";

// ─── Investments ────────────────────────────────

export async function hybridSearchInvestments(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<InvestmentSearchResult[]> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tsQuery = sql`websearch_to_tsquery('english', ${trimmed})`;

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    const vecLit = `[${embedding.join(",")}]`;
    const castVec = sql.raw(`'${vecLit}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`);

    const rows = await db.execute<{
      id: string;
      name: string;
      slug: string;
      description: string;
      category: string | null;
      stage: string;
      status: string;
      operating_status: string;
      location: string | null;
      hybrid_score: number;
    }>(sql`
      WITH keyword_results AS (
        SELECT id,
          row_number() OVER (ORDER BY
            ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
              + word_similarity(${trimmed}, name) * ${TRIGRAM_WEIGHT} DESC, id DESC) AS keyword_rank
        FROM investments
        WHERE search_vector @@ ${tsQuery} OR ${trimmed} <% name
        ORDER BY keyword_rank
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT entity_id AS id,
          row_number() OVER (ORDER BY qwen_4b_fp16_embedding <=> ${castVec}) AS semantic_rank
        FROM embeddings
        WHERE domain = 'investment' AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${castVec}
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT COALESCE(k.id, s.id) AS id,
          k.keyword_rank,
          COALESCE(1.0 / (${RRF_K} + k.keyword_rank), 0)
            + COALESCE(1.0 / (${RRF_K} + s.semantic_rank), 0) AS score
        FROM keyword_results k FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT i.id, i.name, i.slug, i.description, i.category, i.stage,
             i.status, i.operating_status, i.location, c.score AS hybrid_score
      FROM combined c JOIN investments i ON i.id = c.id
      ORDER BY c.score DESC, c.keyword_rank NULLS LAST, c.id LIMIT ${limit}
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      category: r.category,
      stage: r.stage,
      status: r.status,
      operatingStatus: r.operating_status,
      location: r.location,
      score: Number(r.hybrid_score),
    }));
  }

  // FTS-only fallback
  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    description: string;
    category: string | null;
    stage: string;
    status: string;
    operating_status: string;
    location: string | null;
    keyword_score: number;
  }>(sql`
    SELECT id, name, slug, description, category, stage, status, operating_status, location,
      1.0 / (${RRF_K} + row_number() OVER (ORDER BY
        ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
          + word_similarity(${trimmed}, name) * ${TRIGRAM_WEIGHT} DESC, id DESC)) AS keyword_score
    FROM investments
    WHERE search_vector @@ ${tsQuery} OR ${trimmed} <% name
    ORDER BY keyword_score DESC LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    category: r.category,
    stage: r.stage,
    status: r.status,
    operatingStatus: r.operating_status,
    location: r.location,
    score: Number(r.keyword_score),
  }));
}

// ─── Projects ───────────────────────────────────

export async function hybridSearchProjects(options: {
  query: string;
  embedding?: number[];
  limit?: number;
}): Promise<ProjectSearchResult[]> {
  const { query, embedding, limit = DEFAULT_LIMIT } = options;
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tsQuery = sql`websearch_to_tsquery('english', ${trimmed})`;

  if (embedding && embedding.length === CONTENT_EMBEDDING_DIMENSIONS) {
    const vecLit = `[${embedding.join(",")}]`;
    const castVec = sql.raw(`'${vecLit}'::halfvec(${CONTENT_EMBEDDING_DIMENSIONS})`);

    const rows = await db.execute<{
      id: string;
      name: string;
      slug: string;
      description: string;
      short_summary: string;
      url: string;
      image_key: string;
      tags: string[] | null;
      hybrid_score: number;
    }>(sql`
      WITH keyword_results AS (
        SELECT id,
          row_number() OVER (ORDER BY
            ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
              + word_similarity(${trimmed}, name) * ${TRIGRAM_WEIGHT} DESC, id DESC) AS keyword_rank
        FROM projects
        WHERE search_vector @@ ${tsQuery} OR ${trimmed} <% name
        ORDER BY keyword_rank
        LIMIT ${KEYWORD_CANDIDATE_LIMIT}
      ),
      semantic_results AS (
        SELECT entity_id AS id,
          row_number() OVER (ORDER BY qwen_4b_fp16_embedding <=> ${castVec}) AS semantic_rank
        FROM embeddings
        WHERE domain = 'project' AND qwen_4b_fp16_embedding IS NOT NULL
        ORDER BY qwen_4b_fp16_embedding <=> ${castVec}
        LIMIT ${SEMANTIC_CANDIDATE_LIMIT}
      ),
      combined AS (
        SELECT COALESCE(k.id, s.id) AS id,
          k.keyword_rank,
          COALESCE(1.0 / (${RRF_K} + k.keyword_rank), 0)
            + COALESCE(1.0 / (${RRF_K} + s.semantic_rank), 0) AS score
        FROM keyword_results k FULL OUTER JOIN semantic_results s ON k.id = s.id
      )
      SELECT p.id, p.name, p.slug, p.description, p.short_summary, p.url,
             p.image_key, p.tags, c.score AS hybrid_score
      FROM combined c JOIN projects p ON p.id = c.id
      ORDER BY c.score DESC, c.keyword_rank NULLS LAST, c.id LIMIT ${limit}
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      shortSummary: r.short_summary,
      url: r.url,
      imageKey: r.image_key,
      tags: r.tags,
      score: Number(r.hybrid_score),
    }));
  }

  const rows = await db.execute<{
    id: string;
    name: string;
    slug: string;
    description: string;
    short_summary: string;
    url: string;
    image_key: string;
    tags: string[] | null;
    keyword_score: number;
  }>(sql`
    SELECT id, name, slug, description, short_summary, url, image_key, tags,
      1.0 / (${RRF_K} + row_number() OVER (ORDER BY
        ts_rank_cd(search_vector, ${tsQuery}) * ${FTS_WEIGHT}
          + word_similarity(${trimmed}, name) * ${TRIGRAM_WEIGHT} DESC, id DESC)) AS keyword_score
    FROM projects
    WHERE search_vector @@ ${tsQuery} OR ${trimmed} <% name
    ORDER BY keyword_score DESC LIMIT ${limit}
  `);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    shortSummary: r.short_summary,
    url: r.url,
    imageKey: r.image_key,
    tags: r.tags,
    score: Number(r.keyword_score),
  }));
}
