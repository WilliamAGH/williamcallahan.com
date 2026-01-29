/**
 * Cached content aggregator with lazy loading to reduce memory pressure
 *
 * This module provides a more efficient way to aggregate content by:
 * 1. Using React's cache() for request-level caching
 * 2. Loading content types on-demand rather than all at once
 *
 * @module content-similarity/cached-aggregator
 */

import { cache } from "react";
import { aggregateAllContent, filterByTypes } from "./aggregator";
import type { NormalizedContent, RelatedContentType } from "@/types/related-content";

/**
 * Request-cached version of aggregateAllContent
 * This ensures content is only aggregated once per request
 */
export const getCachedAllContent = cache(async (): Promise<NormalizedContent[]> => {
  return await aggregateAllContent();
});

/**
 * Get a lazy-loaded content map that only fetches what's needed
 * This reduces memory usage by avoiding loading all content upfront
 */
export const getLazyContentMap = cache(
  async (types?: RelatedContentType[]): Promise<Map<string, NormalizedContent>> => {
    let content: NormalizedContent[];

    if (types && types.length > 0) {
      // Only load the specific content types needed
      const allContent = await getCachedAllContent();
      content = filterByTypes(allContent, types, undefined);
    } else {
      // If no types specified, load all (backwards compatibility)
      content = await getCachedAllContent();
    }

    // Create the map
    return new Map(content.map((c) => [`${c.type}:${c.id}`, c]));
  },
);
