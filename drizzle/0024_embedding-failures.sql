-- Durable retry checkpoints for endpoint-compatible embedding batches.
CREATE TABLE IF NOT EXISTS "embedding_failures" (
  "domain" text NOT NULL,
  "entity_id" text NOT NULL,
  "last_error" text NOT NULL,
  "retry_at" bigint NOT NULL,
  "updated_at" bigint NOT NULL,
  CONSTRAINT "embedding_failures_pkey" PRIMARY KEY ("domain", "entity_id"),
  CONSTRAINT "embedding_failures_domain_check" CHECK (
    "domain" IN ('bookmark', 'thought', 'blog', 'book', 'investment', 'project', 'ai_analysis', 'opengraph')
  )
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_embedding_failures_retry_at"
  ON "embedding_failures" ("retry_at");
