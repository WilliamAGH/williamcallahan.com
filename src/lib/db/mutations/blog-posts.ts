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
import type { BlogPostInput } from "@/types/schemas/blog-frontmatter";

function getSearchableMdxContent(content: string): string {
  return content
    .replace(/^import\s+.*$/gm, "")
    .replace(/<[A-Z][A-Za-z]*\b[^>]*\/>/g, "")
    .replace(/<[A-Z][A-Za-z]*\b[^>]*>[\s\S]*?<\/[A-Z][A-Za-z]*>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Upsert a batch of blog posts.
 * Uses ON CONFLICT on primary key (id = "mdx-{slug}") for idempotent writes.
 */
export async function upsertBlogPosts(posts: BlogPostInput[]): Promise<number> {
  assertDatabaseWriteAllowed("upsertBlogPosts");

  let upserted = 0;
  for (const post of posts) {
    const { frontmatter } = post;
    const entityId = `mdx-${frontmatter.slug}`;
    const publishedAt = String(frontmatter.publishedAt);
    const updatedAt = frontmatter.updatedAt === undefined ? null : String(frontmatter.updatedAt);
    const coverImage = frontmatter.coverImage === undefined ? null : frontmatter.coverImage;
    const rawContent = getSearchableMdxContent(post.rawContent);
    const draft = frontmatter.draft === true;

    await db
      .insert(blogPosts)
      .values({
        id: entityId,
        title: frontmatter.title,
        slug: frontmatter.slug,
        excerpt: frontmatter.excerpt,
        authorName: frontmatter.author,
        tags: frontmatter.tags,
        publishedAt,
        updatedAt,
        coverImage,
        draft,
        rawContent,
      })
      .onConflictDoUpdate({
        target: blogPosts.id,
        set: {
          title: frontmatter.title,
          slug: frontmatter.slug,
          excerpt: frontmatter.excerpt,
          authorName: frontmatter.author,
          tags: frontmatter.tags,
          publishedAt,
          updatedAt,
          coverImage,
          draft,
          rawContent,
        },
      });
    upserted += 1;
  }
  return upserted;
}
