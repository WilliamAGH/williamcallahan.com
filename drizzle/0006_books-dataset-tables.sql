-- Books dataset storage: latest pointer + versioned JSONB snapshots
-- Mirrors the S3 versioned-snapshot pattern in PostgreSQL

CREATE TABLE IF NOT EXISTS "books_latest" (
  "id" text PRIMARY KEY DEFAULT 'current' NOT NULL,
  "snapshot_checksum" text NOT NULL,
  "snapshot_key" text NOT NULL,
  "updated_at" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "books_snapshots" (
  "checksum" text PRIMARY KEY NOT NULL,
  "payload" jsonb NOT NULL,
  "book_count" integer NOT NULL,
  "generated_at" text NOT NULL,
  "created_at" bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_books_snapshots_created_at" ON "books_snapshots" USING btree ("created_at");
