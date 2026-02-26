-- Unified content_embeddings table: single HNSW index for all domains.
-- Replaces per-domain halfvec columns with one table keyed by (domain, entity_id).

CREATE TABLE IF NOT EXISTS "content_embeddings" (
  "domain" text NOT NULL,
  "entity_id" text NOT NULL,
  "title" text NOT NULL,
  "embedding_text" text,
  "content_date" text,
  "qwen_4b_fp16_embedding" halfvec(2560),
  "updated_at" bigint NOT NULL,
  CONSTRAINT "content_embeddings_pkey" PRIMARY KEY ("domain", "entity_id")
);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_embeddings_hnsw"
  ON "content_embeddings"
  USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_embeddings_domain"
  ON "content_embeddings" ("domain");
