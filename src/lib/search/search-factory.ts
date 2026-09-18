/**
 * Search Factory
 *
 * Builds a search function from a MiniSearch index config: score with
 * searchContent(), project to SearchResult, then put the list on the shared
 * reciprocal-rank scale.
 *
 * @module lib/search/search-factory
 */

import type { SearchResult } from "@/types/schemas/search";
import type { SearchFunctionConfig } from "@/types/search";
import { scoreByRank, searchContent } from "./search-content";

export function createCachedSearchFunction<TDoc, TResult extends SearchResult>(
  config: SearchFunctionConfig<TDoc, TResult>,
): (query: string) => Promise<TResult[]> {
  return async (query: string): Promise<TResult[]> => {
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
    return scoreByRank(scoredResults.map(({ item, score }) => config.transformResult(item, score)));
  };
}
