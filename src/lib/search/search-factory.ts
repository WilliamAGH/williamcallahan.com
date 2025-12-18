/**
 * Search Factory
 *
 * Factory function for creating cached search functions with stale-while-revalidate.
 * Returns cached results immediately (even if stale), then refreshes in the background.
 *
 * @module lib/search/search-factory
 */

import type { SearchResult, SearchFunctionConfig } from "@/types/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import { searchContent } from "./search-content";

/**
 * Track in-flight background refreshes to prevent duplicate work.
 * Key format: `${cacheKey}:${query}`
 */
const backgroundRefreshInFlight = new Set<string>();

/**
 * Execute a search and cache the results. Used for both foreground and background refresh.
 */
async function executeSearch<TDoc, TResult extends SearchResult>(
  config: SearchFunctionConfig<TDoc, TResult>,
  query: string,
): Promise<TResult[]> {
  const index = await config.getIndex();
  const items = await Promise.resolve(config.getItems());
  const scoredResults = searchContent(
    items,
    query,
    config.getSearchableFields,
    config.getExactMatchField,
    index,
    config.getItemId,
  );
  const results = scoredResults.map(({ item, score }) => config.transformResult(item, score));
  ServerCacheInstance.setSearchResults(config.cacheKey, query, results);
  return results;
}

/**
 * Trigger a background refresh for a stale cache entry.
 * Non-blocking - fires and forgets. Dedupes concurrent refresh requests.
 */
function triggerBackgroundRefresh<TDoc, TResult extends SearchResult>(
  config: SearchFunctionConfig<TDoc, TResult>,
  query: string,
): void {
  const refreshKey = `${config.cacheKey}:${query}`;
  if (backgroundRefreshInFlight.has(refreshKey)) {
    return; // Already refreshing this query
  }

  backgroundRefreshInFlight.add(refreshKey);

  // Fire-and-forget: don't await, don't block
  void executeSearch(config, query)
    .catch(err => {
      console.error(`[SWR] Background refresh failed for ${config.cacheKey}:`, err);
    })
    .finally(() => {
      backgroundRefreshInFlight.delete(refreshKey);
    });
}

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
    // Check cache (even stale entries are usable with SWR)
    const cached = ServerCacheInstance.getSearchResults<TResult>(config.cacheKey, query);
    const isStale = cached && ServerCacheInstance.shouldRefreshSearch(config.cacheKey, query);

    // SWR: Return stale cache immediately, trigger background refresh
    if (cached) {
      if (isStale) {
        triggerBackgroundRefresh(config, query);
      }
      return cached.results;
    }

    // No cache: must fetch synchronously (cold start)
    return executeSearch(config, query);
  };
}
