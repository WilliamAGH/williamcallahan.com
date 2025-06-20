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
import { getAllMDXPosts } from "./mdx";

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

  const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const results = allPosts.filter((post) => {
    if (!post) return false;

    if (post.title?.toLowerCase() === query.toLowerCase()) {
      return true;
    }

    // Combine all searchable fields into one long string for better matching
    const allContentText = [
      post.title || "",
      post.excerpt || "",
      ...(post.tags || []),
      post.author?.name || "",
      post.rawContent || "", // Include raw content
    ]
      .filter((field) => typeof field === "string" && field.length > 0)
      .join(" ")
      .toLowerCase();

    // Check if all search terms exist in the combined text
    return searchTerms.every((term) => allContentText.includes(term));
  });

  // Map results to the SearchResult format
  return results
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(
      (post) =>
        ({
          id: post.slug,
          type: "blog-post",
          title: `[Blog] ${post.title || "Untitled Post"}`, // Add prefix
          description: post.excerpt || "No excerpt available.",
          url: `/blog/${post.slug}`,
          score: 0,
        }) as SearchResult,
    );
}
