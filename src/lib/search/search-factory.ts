/**
 * Search Factory
 *
 * Factory function for creating cached search functions.
 * Eliminates the repetitive cache-check -> search -> transform -> cache-set pattern.
 *
 * @module lib/search/search-factory
 */

import type { SearchResult, SearchFunctionConfig } from "@/types/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { searchContent } from "./search-content";

/**
 * Factory for creating cached search functions.
 *
 * This eliminates the repetitive pattern found in all 7 search functions:
 * 1. Check cache for existing results
 * 2. Get the MiniSearch index
 * 3. Get the source items
 * 4. Run searchContent() with configuration
 * 5. Transform results to SearchResult format
 * 6. Cache the results
 *
 * @template TDoc - The document type being searched
 * @template TResult - The search result type (extends SearchResult)
 * @param config - Search function configuration
 * @returns An async search function that takes a query string
 *
 * @example
 * ```typescript
 * export const searchInvestments = createCachedSearchFunction({
 *   cacheKey: "investments",
 *   getIndex: getInvestmentsIndex,
 *   getItems: () => investments,
 *   getSearchableFields: (inv) => [inv.name, inv.description, inv.type],
 *   getExactMatchField: (inv) => inv.name,
 *   transformResult: (inv, score) => ({
 *     id: inv.id,
 *     type: "project",
 *     title: inv.name,
 *     description: inv.description,
 *     url: `/investments#${inv.id}`,
 *     score,
 *   }),
 * });
 * ```
 */
export function createCachedSearchFunction<TDoc, TResult extends SearchResult>(
  config: SearchFunctionConfig<TDoc, TResult>,
): (query: string) => Promise<TResult[]> {
  return async (query: string): Promise<TResult[]> => {
    // 1. Check cache
    const cached = ServerCacheInstance.getSearchResults<TResult>(config.cacheKey, query);
    if (cached && !ServerCacheInstance.shouldRefreshSearch(config.cacheKey, query)) {
      return cached.results;
    }

    // 2. Get index
    const index = await config.getIndex();

    // 3. Get items
    const items = await Promise.resolve(config.getItems());

    // 4. Search
    const scoredResults = searchContent(
      items,
      query,
      config.getSearchableFields,
      config.getExactMatchField,
      index,
      config.getItemId,
    );

    // 5. Transform results
    const results = scoredResults.map(({ item, score }) => config.transformResult(item, score));

    // 6. Cache results
    ServerCacheInstance.setSearchResults(config.cacheKey, query, results);

    return results;
  };
}
