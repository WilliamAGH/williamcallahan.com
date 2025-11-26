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

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const results = allPosts.filter(post => {
    if (!post) return false;

    if (post.title?.toLowerCase() === query.toLowerCase()) {
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

  // Map results to the SearchResult format
  // Note: [Blog] prefix is added by the aggregator in /api/search/all for consistency
  return results
    .toSorted((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(
      post =>
        ({
          id: post.slug,
          type: "blog-post",
          title: post.title || "Untitled Post",
          description: post.excerpt || "No excerpt available.",
          url: `/blog/${post.slug}`,
          score: 0,
        }) as SearchResult,
    );
}
