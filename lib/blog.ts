/**
 * Blog Utilities
 */

import { posts } from '@/data/blog/posts';
import type { BlogPost } from '@/types/blog';

export async function getAllPosts(): Promise<BlogPost[]> {
  return posts.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return posts.find(post => post.slug === slug) ?? null;
}