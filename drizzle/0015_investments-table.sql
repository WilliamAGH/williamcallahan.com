-- Migration: Create investments table with FTS + trigram indexes.
-- Embeddings live in embeddings (domain = 'investment').

CREATE TABLE IF NOT EXISTS "investments" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text NOT NULL,
  "type" text NOT NULL,
  "stage" text NOT NULL,
  "category" text,
  "status" text NOT NULL,
  "operating_status" text NOT NULL,
  "invested_year" text NOT NULL,
  "founded_year" text,
  "shutdown_year" text,
  "acquired_year" text,
  "location" text,
  "website" text,
  "aventure_url" text,
  "logo_only_domain" text,
  "logo" text,
  "multiple" double precision NOT NULL,
  "holding_return" double precision NOT NULL,
  "accelerator" jsonb,
  "details" jsonb,
  "metrics" jsonb,
  "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("category", '') || ' ' || coalesce("stage", '')), 'C')
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_investments_slug" ON "investments" ("slug");
CREATE INDEX IF NOT EXISTS "idx_investments_search_vector" ON "investments" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "idx_investments_name_trgm" ON "investments" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_investments_status" ON "investments" ("status");
CREATE INDEX IF NOT EXISTS "idx_investments_invested_year" ON "investments" ("invested_year");
