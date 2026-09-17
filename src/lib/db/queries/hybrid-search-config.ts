/**
 * Shared configuration for hybrid search queries.
 *
 * All hybrid search functions (bookmarks, thoughts, investments, projects,
 * books, blog posts) rank keyword and semantic candidates separately, then
 * merge them with reciprocal rank fusion (RRF): score = Σ 1 / (RRF_K + rank).
 * Ranks are scale-free, so keyword evidence and cosine similarity never need
 * calibrating against each other, and every domain lands on the same scale.
 *
 * @module db/queries/hybrid-search-config
 */

/** Weight applied to full-text search (ts_rank_cd) when ordering keyword candidates. */
export const FTS_WEIGHT = 2.0;

/** Weight applied to trigram (pg_trgm word_similarity) when ordering keyword candidates. */
export const TRIGRAM_WEIGHT = 0.5;

/** RRF smoothing constant; 60 is the standard value from the original RRF paper. */
export const RRF_K = 60;

/** Maximum keyword (FTS + trigram) candidate rows per query. */
export const KEYWORD_CANDIDATE_LIMIT = 50;

/** Maximum semantic (pgvector) candidate rows per query. */
export const SEMANTIC_CANDIDATE_LIMIT = 50;

/** Default result limit when caller doesn't specify. */
export const DEFAULT_LIMIT = 20;
