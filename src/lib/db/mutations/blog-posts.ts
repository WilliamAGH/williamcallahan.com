/**
 * Blog post mutations — upsert blog post data into PostgreSQL.
 *
 * Source data: data/blog/posts/*.mdx (parsed via gray-matter)
 * Schema: src/lib/db/schema/blog-posts.ts
 *
 * @module lib/db/mutations/blog-posts
 */

import { assertDatabaseWriteAllowed, db } from "@/lib/db/connection";
import { blogPosts } from "@/lib/db/schema/blog-posts";
import type { BlogPostInput } from "@/types/blog";

/**
 * Upsert a batch of blog posts.
 * Uses ON CONFLICT on primary key (id = "mdx-{slug}") for idempotent writes.
 */
export async function upsertBlogPosts(posts: BlogPostInput[]): Promise<number> {
  assertDatabaseWriteAllowed("upsertBlogPosts");

  let upserted = 0;
  for (const post of posts) {
    const entityId = `mdx-${post.slug}`;
    const publishedAt = String(post.frontmatter.publishedAt);
    const updatedAt = post.frontmatter.updatedAt ? String(post.frontmatter.updatedAt) : null;
    const tags = Array.isArray(post.frontmatter.tags) ? post.frontmatter.tags : null;

    await db
      .insert(blogPosts)
      .values({
        id: entityId,
        title: post.frontmatter.title,
        slug: post.slug,
        excerpt: post.frontmatter.excerpt ?? null,
        authorName: post.frontmatter.author,
        tags,
        publishedAt,
        updatedAt,
        coverImage: post.frontmatter.coverImage ?? null,
        draft: false,
        rawContent: post.rawContent,
      })
      .onConflictDoUpdate({
        target: blogPosts.id,
        set: {
          title: post.frontmatter.title,
          slug: post.slug,
          excerpt: post.frontmatter.excerpt ?? null,
          authorName: post.frontmatter.author,
          tags,
          publishedAt,
          updatedAt,
          coverImage: post.frontmatter.coverImage ?? null,
          rawContent: post.rawContent,
        },
      });
    upserted += 1;
  }
  return upserted;
}
