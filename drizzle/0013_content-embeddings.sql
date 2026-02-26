-- Unified embeddings table: single HNSW index for all domains.
-- Replaces per-domain halfvec columns with one table keyed by (domain, entity_id).

CREATE TABLE IF NOT EXISTS "embeddings" (
  "domain" text NOT NULL,
  "entity_id" text NOT NULL,
  "title" text NOT NULL,
  "embedding_text" text,
  "content_date" text,
  "qwen_4b_fp16_embedding" halfvec(2560),
  "updated_at" bigint NOT NULL,
  CONSTRAINT "embeddings_pkey" PRIMARY KEY ("domain", "entity_id")
);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_hnsw"
  ON "embeddings"
  USING hnsw ("qwen_4b_fp16_embedding" halfvec_cosine_ops);

-->  statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embeddings_domain"
  ON "embeddings" ("domain");
