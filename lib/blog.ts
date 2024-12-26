/**
 * Blog Data Management
 */

import { posts as staticPosts } from '@/data/blog/posts';
import { getAllMDXPosts, getMDXPost } from './blog/mdx';
import type { BlogPost } from '@/types/blog';

/**
 * Retrieves all blog posts sorted by publish date
 */
export async function getAllPosts(): Promise<BlogPost[]> {
  // Get posts from both sources
  const mdxPosts = await getAllMDXPosts();
  const allPosts = [...staticPosts, ...mdxPosts];
  
  // Sort by date, newest first
  return allPosts.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

/**
 * Retrieves a single blog post by its slug
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  // Check static posts first
  const staticPost = staticPosts.find(post => post.slug === slug);
  if (staticPost) return staticPost;
  
  // Then check MDX posts
  return await getMDXPost(slug);
}

/**
 * Retrieves all unique tags from blog posts
 */
export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPosts();
  const tags = new Set(posts.flatMap(post => post.tags));
  return Array.from(tags).sort();
}