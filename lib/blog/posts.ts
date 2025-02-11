/**
 * Blog Post Utilities
 * @module lib/blog/posts
 * @description
 * Shared utilities for fetching and filtering blog posts.
 */

import { getAllPosts as _getAllPosts } from '../blog';
import type { BlogPost } from '../../types/blog';

/**
 * Get all blog posts
 * @returns {Promise<BlogPost[]>} Array of all posts
 */
export async function getAllPosts(): Promise<BlogPost[]> {
  return _getAllPosts();
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
