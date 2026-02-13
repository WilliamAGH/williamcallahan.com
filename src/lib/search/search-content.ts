/**
 * Search Content Function
 *
 * Generic search function that filters items based on a query.
 * Uses MiniSearch for fuzzy matching when available, falls back to substring search.
 *
 * @module lib/search/search-content
 */

import type MiniSearch from "minisearch";
import type { ScoredResult } from "@/types/search";
import { sanitizeSearchQuery } from "@/lib/validators/search";
import { envLogger } from "@/lib/utils/env-logger";

/**
 * Generic search function that filters items based on a query.
 * Uses MiniSearch for fuzzy matching when available, falls back to substring search.
 * Returns items with relevance scores for proper ranking.
 *
 * @template T - The document type being searched
 * @param items - Array of items to search
 * @param query - Search query string
 * @param getSearchableFields - Function to extract searchable text from an item
 * @param getExactMatchField - Optional function to get field for exact matching
 * @param miniSearchIndex - Optional pre-built MiniSearch index
 * @param getItemId - Optional function to extract ID from item (defaults to item.id)
 * @returns Filtered array of items with scores, sorted by relevance
 *
 * @example
 * ```typescript
 * const results = searchContent(
 *   investments,
 *   "tech startup",
 *   (inv) => [inv.name, inv.description, inv.type],
 *   (inv) => inv.name,
 *   investmentsIndex
 * );
 * ```
 */
export function searchContent<T>(
  items: T[],
  query: string,
  getSearchableFields: (item: T) => (string | undefined | null)[],
  getExactMatchField?: (item: T) => string,
  miniSearchIndex?: MiniSearch<T> | null,
  getItemId?: (item: T) => string,
): ScoredResult<T>[] {
  // Sanitize the query first
  const sanitizedQuery = sanitizeSearchQuery(query);
  if (!sanitizedQuery) return items.map((item) => ({ item, score: 0 }));

  // Helper to extract item ID
  const extractId = (item: T): string => {
    if (getItemId) return getItemId(item);
    const itemWithId = item as T & { id?: string | number; name?: string; slug?: string };
    return String(itemWithId.id ?? itemWithId.name ?? itemWithId.slug ?? item);
  };

  // If we have a MiniSearch index, use it for fuzzy search
  if (miniSearchIndex) {
    try {
      const searchResults = miniSearchIndex.search(sanitizedQuery, {
        prefix: true, // Allow prefix matching for autocomplete-like behavior
        fuzzy: 0.2, // Allow typos (20% edit distance)
        boost: {
          // Boost exact matches
          exactMatch: 2,
        },
        combineWith: "OR", // Any term can match; MiniSearch scoring ranks multi-term hits higher
      });

      // Reuse pattern from searchBookmarks(): capture scores in a Map
      const resultIds = new Set(searchResults.map((r) => String(r.id)));
      const scoreById = new Map(searchResults.map((r) => [String(r.id), r.score ?? 0] as const));

      return items
        .filter((item) => resultIds.has(extractId(item)))
        .map((item) => ({
          item,
          score: scoreById.get(extractId(item)) ?? 0,
        }))
        .toSorted((a, b) => b.score - a.score);
    } catch (error) {
      envLogger.log(
        "MiniSearch failed, falling back to substring search",
        { error: String(error) },
        { category: "Search" },
      );
      // Fall through to substring search
    }
  }

  // Fallback: Original substring search implementation with basic scoring
  const searchTerms = sanitizedQuery.split(/\s+/).filter(Boolean);

  return items
    .filter((item) => {
      // First try exact match if exact match field is provided
      if (getExactMatchField) {
        const exactField = getExactMatchField(item);
        if (exactField.toLowerCase() === sanitizedQuery) {
          return true;
        }
      }

      // Combine all searchable fields into one long string for better matching
      const allContentText = getSearchableFields(item)
        .filter((field): field is string => typeof field === "string" && field.length > 0)
        .join(" ")
        .toLowerCase();

      // Check if all search terms exist in the combined text
      return searchTerms.every((term) => allContentText.includes(term));
    })
    .map((item) => {
      // Calculate a basic relevance score for substring matches
      const exactField = getExactMatchField?.(item)?.toLowerCase() ?? "";
      if (exactField === sanitizedQuery) {
        return { item, score: 1.0 }; // Exact match = highest score
      }
      // Partial matches get a lower score
      return { item, score: 0.5 };
    });
}
