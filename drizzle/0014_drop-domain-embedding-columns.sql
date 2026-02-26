-- Migration: Drop per-domain embedding columns and HNSW indexes.
-- Embeddings now live exclusively in the unified content_embeddings table.
-- See: 0013_content-embeddings.sql (created the unified table)

-- Bookmarks: drop HNSW index, then column
DROP INDEX IF EXISTS "idx_bookmarks_qwen_4b_fp16_embedding";
ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "qwen_4b_fp16_embedding";

-- Thoughts: drop HNSW index, then column
DROP INDEX IF EXISTS "idx_thoughts_embedding";
ALTER TABLE "thoughts" DROP COLUMN IF EXISTS "qwen_4b_fp16_embedding";

-- AI Analysis Latest: drop HNSW index, then column
DROP INDEX IF EXISTS "idx_ai_analysis_latest_embedding";
ALTER TABLE "ai_analysis_latest" DROP COLUMN IF EXISTS "qwen_4b_fp16_embedding";

-- OpenGraph Metadata: drop HNSW index, then column
DROP INDEX IF EXISTS "idx_opengraph_metadata_embedding";
ALTER TABLE "opengraph_metadata" DROP COLUMN IF EXISTS "qwen_4b_fp16_embedding";
