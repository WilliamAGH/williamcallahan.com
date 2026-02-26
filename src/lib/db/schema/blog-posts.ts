/**
 * Blog Posts PostgreSQL Schema
 *
 * Stores blog post frontmatter + raw content for FTS + trigram search.
 * Embeddings live in embeddings (domain = 'blog').
 *
 * Source data: data/blog/posts/*.mdx (seeded via scripts/seed-blog-posts.node.mjs)
 * Type definition: src/types/blog.ts (BlogPageFrontmatter)
 *
 * @module lib/db/schema/blog-posts
 */

import { type SQL, sql } from "drizzle-orm";
import { boolean, customType, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const blogPosts = pgTable(
  "blog_posts",
  {
    /** Entity ID: "mdx-{slug}" */
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    excerpt: text("excerpt"),
    authorName: text("author_name").notNull(),
    tags: jsonb("tags").$type<string[]>(),
    publishedAt: text("published_at").notNull(),
    updatedAt: text("updated_at"),
    coverImage: text("cover_image"),
    draft: boolean("draft").notNull().default(false),
    rawContent: text("raw_content"),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      (): SQL => sql`
        setweight(to_tsvector('english', coalesce(${blogPosts.title}, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(${blogPosts.excerpt}, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(${blogPosts.rawContent}, '')), 'C')
      `,
    ),
  },
  (table) => [
    uniqueIndex("idx_blog_posts_slug").on(table.slug),
    index("idx_blog_posts_search_vector").using("gin", table.searchVector),
    index("idx_blog_posts_title_trgm").using("gin", sql`${table.title} gin_trgm_ops`),
    index("idx_blog_posts_published_at").on(table.publishedAt),
  ],
);
