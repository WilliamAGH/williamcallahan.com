/**
 * Thoughts Search
 *
 * Placeholder search for /thoughts collection page.
 * Will be enhanced with Chroma vector store when available.
 *
 * @module lib/search/searchers/thoughts-search
 */

import type { SearchResult } from "@/types/search";
import { PAGE_METADATA } from "@/data/metadata";
import { sanitizeSearchQuery } from "@/lib/validators/search";

/**
 * Search thoughts by query.
 * Currently returns a navigation result for /thoughts collection page.
 */
export function searchThoughts(query: string): Promise<SearchResult[]> {
  const sanitized = sanitizeSearchQuery(query);
  if (!sanitized) return Promise.resolve([]);

  const pageTitle =
    typeof PAGE_METADATA.thoughts.title === "string" ? PAGE_METADATA.thoughts.title : "Thoughts";
  const pageDescription =
    typeof PAGE_METADATA.thoughts.description === "string"
      ? PAGE_METADATA.thoughts.description
      : undefined;

  return Promise.resolve([
    {
      id: "thoughts-page",
      type: "page",
      title: pageTitle,
      description: pageDescription,
      url: "/thoughts",
      score: 0.1,
    },
  ]);
}
