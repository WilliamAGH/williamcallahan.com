-- Add Qwen3-Embedding-4B halfvec(2560) embedding columns and supporting indexes
-- to domain tables for repo-wide semantic search.
--
-- Tables affected:
--   ai_analysis_latest   — AI-generated summaries (80 rows)
--   opengraph_metadata   — cached OG tags per URL (508 rows)
--   thoughts             — TIL-style short-form content (future)

-->  statement-breakpoint
ALTER TABLE "ai_analysis_latest"
  ADD COLUMN "qwen_4b_fp16_embedding" halfvec(2560);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_analysis_latest_embedding"
  ON "ai_analysis_latest"
  USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);

-->  statement-breakpoint
ALTER TABLE "opengraph_metadata"
  ADD COLUMN "qwen_4b_fp16_embedding" halfvec(2560);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opengraph_metadata_embedding"
  ON "opengraph_metadata"
  USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);

-->  statement-breakpoint
ALTER TABLE "thoughts"
  ADD COLUMN "qwen_4b_fp16_embedding" halfvec(2560);

-->  statement-breakpoint
ALTER TABLE "thoughts"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("category", '')), 'C')
  ) STORED;

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thoughts_embedding"
  ON "thoughts"
  USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thoughts_search_vector"
  ON "thoughts"
  USING gin ("search_vector");

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_thoughts_title_trgm"
  ON "thoughts"
  USING gin ("title" gin_trgm_ops);
