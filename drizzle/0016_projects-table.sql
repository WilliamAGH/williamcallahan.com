-- Projects table: static project portfolio with FTS + trigram
CREATE TABLE IF NOT EXISTS "projects" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text NOT NULL,
  "short_summary" text NOT NULL,
  "url" text NOT NULL,
  "github_url" text,
  "image_key" text NOT NULL,
  "tags" jsonb,
  "tech_stack" jsonb,
  "note" text,
  "cv_featured" boolean NOT NULL DEFAULT false,
  "registry_links" jsonb,
  "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '') || ' ' || coalesce("short_summary", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("note", '')), 'C')
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_projects_slug" ON "projects" ("slug");
CREATE INDEX IF NOT EXISTS "idx_projects_search_vector" ON "projects" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "idx_projects_name_trgm" ON "projects" USING gin ("name" gin_trgm_ops);
