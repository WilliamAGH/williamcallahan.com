
/**
 * Blog Search API Route
 *
 * This route provides a server-side search endpoint for blog posts.
 * It allows clients to search through blog posts by title, excerpt, tags,
 * and author name. The results are formatted as SearchResult objects
 * for use in the terminal search interface.
 *
 * @see {@link lib/search.ts} For the client-side search implementation
 * @see {@link components/features/blog/blog-window.client.tsx} For the terminal search UI
 */

import { NextResponse } from 'next/server';
import { getAllMDXPosts } from '@/lib/blog/mdx';
import type { BlogPost } from '@/types/blog';
import type { SearchResult } from '@/types/search'; // Use the existing SearchResult type

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, and author name.
 */
async function filterBlogPosts(query: string): Promise<SearchResult[]> {
  const allPosts = await getAllMDXPosts();

  if (!query) {
    // Return empty if no query provided for a search endpoint
    return [];
  }

  const searchTerms = query.toLowerCase().split(' ').filter(Boolean);

  const results = allPosts.filter(post => {
    // Ensure post and necessary fields exist before searching
    if (!post) return false;

    // Exact title match first
    if (post.title?.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Aggregate searchable fields, handling potential undefined values
    const searchFields = [
      post.title,
      post.excerpt,
      ...(post.tags || []), // Use empty array if tags are undefined
      post.author?.name,    // Safely access author name
      post.rawContent       // Include the raw content for searching
    ].filter((field): field is string => typeof field === 'string' && field.length > 0);

    // Check if all search terms are included in any of the fields
    return searchTerms.every(term =>
      searchFields.some(field => field.toLowerCase().includes(term))
    );
  });

  // Map results to the SearchResult format needed by the terminal
  return results
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()) // Sort newest first
    .map(post => ({
      label: post.title || 'Untitled Post', // Provide fallback label
      description: post.excerpt || 'No excerpt available.', // Provide fallback description
      path: `/blog/${post.slug}`
    }));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query) {
      return NextResponse.json({ error: 'Search query parameter "q" is required' }, { status: 400 });
    }

    const searchResults = await filterBlogPosts(query);

    return NextResponse.json(searchResults);

  } catch (error) {
    console.error('Blog search API error:', error);
    // Determine if it's a known error type or generic
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to perform blog search', details: errorMessage }, { status: 500 });
  }
}
