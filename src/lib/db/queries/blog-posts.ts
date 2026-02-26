/**
 * Blog post queries — read blog post data from PostgreSQL.
 *
 * @module lib/db/queries/blog-posts
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/connection";
import { blogPosts } from "@/lib/db/schema/blog-posts";

/** Retrieve all non-draft blog posts ordered by published_at (newest first). */
export async function getPublishedBlogPosts() {
  return db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.draft, false))
    .orderBy(desc(blogPosts.publishedAt));
}

/** Retrieve all blog posts including drafts, ordered by published_at (newest first). */
export async function getAllBlogPosts() {
  return db.select().from(blogPosts).orderBy(desc(blogPosts.publishedAt));
}

/** Retrieve a single blog post by slug. Returns undefined if not found. */
export async function getBlogPostBySlug(slug: string) {
  const rows = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug)).limit(1);
  return rows[0];
}
