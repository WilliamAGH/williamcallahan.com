/**
 * Shared configuration for hybrid search queries.
 *
 * All hybrid search functions (bookmarks, thoughts, investments, projects,
 * books, blog posts) use these same weights so scoring is consistent
 * across domains.
 *
 * @module db/queries/hybrid-search-config
 */

/** Weight applied to full-text search (ts_rank_cd) scores. */
export const FTS_WEIGHT = 2.0;

/** Weight applied to trigram (pg_trgm) similarity scores. */
export const TRIGRAM_WEIGHT = 0.5;

/** Weight applied to pgvector cosine similarity scores. */
export const VECTOR_WEIGHT = 10.0;

/** Maximum keyword (FTS + trigram) candidate rows per query. */
export const KEYWORD_CANDIDATE_LIMIT = 50;

/** Maximum semantic (pgvector) candidate rows per query. */
export const SEMANTIC_CANDIDATE_LIMIT = 50;

/** Default result limit when caller doesn't specify. */
export const DEFAULT_LIMIT = 20;
