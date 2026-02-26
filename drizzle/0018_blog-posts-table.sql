-- Blog posts table: MDX frontmatter + raw content with FTS + trigram
CREATE TABLE IF NOT EXISTS "blog_posts" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "excerpt" text,
  "author_name" text NOT NULL,
  "tags" jsonb,
  "published_at" text NOT NULL,
  "updated_at" text,
  "cover_image" text,
  "draft" boolean NOT NULL DEFAULT false,
  "raw_content" text,
  "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("excerpt", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("raw_content", '')), 'C')
  ) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_blog_posts_slug" ON "blog_posts" ("slug");
CREATE INDEX IF NOT EXISTS "idx_blog_posts_search_vector" ON "blog_posts" USING gin ("search_vector");
CREATE INDEX IF NOT EXISTS "idx_blog_posts_title_trgm" ON "blog_posts" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_blog_posts_published_at" ON "blog_posts" ("published_at");
