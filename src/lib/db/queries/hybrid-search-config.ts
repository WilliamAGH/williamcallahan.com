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

/**
 * Ranked candidate lists fused per hybrid domain (keyword + semantic).
 *
 * A domain that ran a single ranker multiplies its reciprocal rank by this, so
 * one rank is read as that rank in every slot the domain has. Without it the
 * sum of two reciprocal ranks is read against a single one in the site-wide
 * sort, and the worst dual-list row (2/110) outranks the best single-ranker row
 * (1/61) regardless of match quality.
 *
 * This applies to the keyword-only fallback too: with no query embedding no
 * semantic ranker runs at all, so its rank fills both slots. A row missing from
 * a list that did run still contributes 0 — that ranker saw it and passed.
 */
export const RRF_RANKER_COUNT = 2;

/**
 * Highest score the shared reciprocal-rank scale can produce: rank 1 in every
 * ranker slot. Divide by this to read a score as a 0..1 relevance.
 */
export const MAX_RECIPROCAL_RANK_SCORE = RRF_RANKER_COUNT / (RRF_K + 1);

/** Maximum keyword (FTS + trigram) candidate rows per query. */
export const KEYWORD_CANDIDATE_LIMIT = 50;

/** Maximum semantic (pgvector) candidate rows per query. */
export const SEMANTIC_CANDIDATE_LIMIT = 50;

/** Default result limit when caller doesn't specify. */
export const DEFAULT_LIMIT = 20;
