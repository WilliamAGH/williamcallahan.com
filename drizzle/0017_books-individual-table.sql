-- Books individual rows: normalized per-book data with FTS + trigram
CREATE TABLE IF NOT EXISTS "books" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "subtitle" text,
  "authors" jsonb,
  "publisher" text,
  "published_year" text,
  "genres" jsonb,
  "description" text,
  "formats" jsonb NOT NULL,
  "isbn10" text,
  "isbn13" text,
  "asin" text,
  "audio_narrators" jsonb,
  "audio_duration_seconds" double precision,
  "audio_chapter_count" integer,
  "cover_url" text,
  "cover_blur_data_url" text,
  "find_my_book_url" text,
  "publisher_url" text,
  "amazon_url" text,
  "audible_url" text,
  "bookshop_url" text,
  "ai_summary" text,
  "thoughts" text,
  "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("subtitle", '') || ' ' || coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("ai_summary", '')), 'C')
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_books_slug" ON "books" ("slug");
CREATE INDEX IF NOT EXISTS "idx_books_search_vector" ON "books" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "idx_books_title_trgm" ON "books" USING gin ("title" gin_trgm_ops);
