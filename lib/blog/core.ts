/**
 * Core Blog Functionality
 * @module lib/blog/core
 * @description
 * Core blog functionality including post retrieval and sorting.
 * This module serves as the central point for blog data management.
 */

import { posts as staticPosts } from '@/data/blog/posts';
import { getAllMDXPosts, getMDXPost } from './mdx';
import type { BlogPost } from '@/types/blog';
import { sortDates } from '../dateTime';

/**
 * Retrieves all blog posts sorted by publish date
 * @returns {Promise<BlogPost[]>} Array of all posts, sorted by date
 */
export async function getAllPosts(): Promise<BlogPost[]> {
  // Get posts from both sources
  const mdxPosts = await getAllMDXPosts();
  const allPosts = [...staticPosts, ...mdxPosts];

  // Sort by date, newest first
  return allPosts.sort((a, b) => sortDates(a.publishedAt, b.publishedAt));
}

/**
 * Retrieves a single blog post by its slug
 * @param {string} slug - The post slug to retrieve
 * @returns {Promise<BlogPost | null>} The blog post or null if not found
 */
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  // Check static posts first
  const staticPost = staticPosts.find(post => post.slug === slug);
  if (staticPost) return staticPost;

  // Then check MDX posts
  return await getMDXPost(slug);
}

/**
 * Get all available tags from posts
 * @returns {Promise<string[]>} Array of unique tags
 */
export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPosts();
  const tags = new Set<string>();
  posts.forEach(post => post.tags.forEach(tag => tags.add(tag.toLowerCase())));
  return Array.from(tags);
}

/**
 * Get posts filtered by tag
 * @param {string} tag - Tag to filter by
 * @returns {Promise<BlogPost[]>} Filtered posts
 */
export async function getPostsByTag(tag: string): Promise<BlogPost[]> {
  const posts = await getAllPosts();
  return posts.filter(post =>
    post.tags.some(t => t.toLowerCase() === tag.toLowerCase())
  );
}

/**
 * Check if a tag exists
 * @param {string} tag - Tag to check
 * @returns {Promise<boolean>} Whether the tag exists
 */
export async function tagExists(tag: string): Promise<boolean> {
  const tags = await getAllTags();
  return tags.includes(tag.toLowerCase());
}
