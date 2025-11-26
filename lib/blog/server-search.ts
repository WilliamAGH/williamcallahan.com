/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, author name, and raw content.
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */

import { assertServerOnly } from "../utils/ensure-server-only";
assertServerOnly(); // Ensure this module runs only on the server

import type { SearchResult } from "@/types/search";
import { getAllMDXPostsForSearch } from "./mdx";
import type { BlogPost } from "@/types/blog";

/**
 * Calculate relevance score for a blog post based on query match quality.
 * Higher scores indicate better matches.
 *
 * @param post - The blog post to score
 * @param query - The original search query (lowercase)
 * @param searchTerms - Individual search terms (lowercase)
 * @returns Score from 0 to 1, where 1 is a perfect match
 */
function calculateBlogRelevanceScore(post: BlogPost, query: string, searchTerms: string[]): number {
  const title = (post.title || "").toLowerCase();
  const excerpt = (post.excerpt || "").toLowerCase();
  const tags = (post.tags || []).map(t => t.toLowerCase());

  // Exact title match = highest score
  if (title === query) {
    return 1.0;
  }

  let score = 0;

  // Title contains all terms = high score
  const titleTermMatches = searchTerms.filter(term => title.includes(term)).length;
  if (titleTermMatches === searchTerms.length) {
    score += 0.7;
  } else {
    score += (titleTermMatches / searchTerms.length) * 0.5;
  }

  // Excerpt contains terms = medium score
  const excerptTermMatches = searchTerms.filter(term => excerpt.includes(term)).length;
  score += (excerptTermMatches / searchTerms.length) * 0.2;

  // Tags match = bonus
  const tagMatches = searchTerms.filter(term => tags.some(tag => tag.includes(term))).length;
  score += (tagMatches / searchTerms.length) * 0.1;

  return Math.min(score, 1.0);
}

/**
 * Server-side function to filter blog posts based on a query.
 * Searches title, excerpt, tags, and author name (raw content excluded for memory efficiency).
 *
 * @param query - The search query string.
 * @returns A promise that resolves to an array of matching SearchResult objects.
 */
export async function searchBlogPostsServerSide(query: string): Promise<SearchResult[]> {
  // Use lightweight posts without rawContent to reduce memory usage
  const allPosts = await getAllMDXPostsForSearch();

  if (!query) {
    return []; // Return empty if no query provided for a search
  }

  const normalizedQuery = query.toLowerCase();
  const searchTerms = normalizedQuery.split(/\s+/).filter(Boolean);

  const results = allPosts.filter(post => {
    if (!post) return false;

    if (post.title?.toLowerCase() === normalizedQuery) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    // NOTE: rawContent excluded to reduce memory usage during search
    const allContentText = [
      post.title || "",
      post.excerpt || "",
      ...(post.tags || []),
      post.author?.name || "",
      // rawContent excluded - was causing memory explosion
    ]
      .filter(field => typeof field === "string" && field.length > 0)
      .join(" ")
      .toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every(term => allContentText.includes(term));
  });

  // Map results to SearchResult format with relevance scores
  // Note: [Blog] prefix is added by the aggregator in /api/search/all for consistency
  return results
    .map(post => ({
      post,
      score: calculateBlogRelevanceScore(post, normalizedQuery, searchTerms),
    }))
    .toSorted((a, b) => {
      // Primary sort: relevance score (descending)
      // Secondary sort: recency (descending) for same scores
      const scoreDiff = b.score - a.score;
      if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
      return new Date(b.post.publishedAt).getTime() - new Date(a.post.publishedAt).getTime();
    })
    .map(
      ({ post, score }) =>
        ({
          id: post.slug,
          type: "blog-post",
          title: post.title || "Untitled Post",
          description: post.excerpt || "No excerpt available.",
          url: `/blog/${post.slug}`,
          score,
        }) as SearchResult,
    );
}
