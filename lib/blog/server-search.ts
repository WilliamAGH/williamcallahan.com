/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, author name, and raw content.
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */

import { assertServerOnly } from '../utils/ensure-server-only';
assertServerOnly('lib/blog/server-search.ts'); // Ensure this module runs only on the server

import { getAllMDXPosts } from './mdx';
import type { BlogPost } from '@/types/blog';
import type { SearchResult } from '@/types/search';

/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, author name, and raw content.
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */
export async function searchBlogPostsServerSide(query: string): Promise<SearchResult[]> {
  const allPosts = await getAllMDXPosts();

  if (!query) {
    return []; // Return empty if no query provided for a search
  }

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);

  const results = allPosts.filter(post => {
    if (!post) return false;

    if (post.title?.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    const searchFields = [
      post.title,
      post.excerpt,
      ...(post.tags || []),
      post.author?.name,
      post.rawContent // Include raw content
    ].filter((field): field is string => typeof field === 'string' && field.length > 0);

    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  });

  // Map results to the SearchResult format
  return results
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(post => ({
      label: `[Blog] ${post.title || 'Untitled Post'}`, // Add prefix
      description: post.excerpt || 'No excerpt available.',
      path: `/blog/${post.slug}`
    }));
}
