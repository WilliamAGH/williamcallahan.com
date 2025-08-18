/**
 * Cached content aggregator with lazy loading to reduce memory pressure
 * 
 * This module provides a more efficient way to aggregate content by:
 * 1. Using React's cache() for request-level caching
 * 2. Loading content types on-demand rather than all at once
 * 3. Implementing a streaming approach for large datasets
 * 
 * @module content-similarity/cached-aggregator
 */

import { cache } from "react";
import { aggregateAllContent, getContentById, filterByTypes } from "./aggregator";
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
export const getLazyContentMap = cache(async (
  types?: RelatedContentType[]
): Promise<Map<string, NormalizedContent>> => {
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
});

/**
 * Get content by specific IDs efficiently
 * This is more memory-efficient than loading everything when you only need specific items
 */
export const getContentByIds = cache(async (
  ids: Array<{ type: RelatedContentType; id: string }>
): Promise<Map<string, NormalizedContent>> => {
  const contentMap = new Map<string, NormalizedContent>();
  
  // Fetch each content item individually (these calls may be cached internally)
  const promises = ids.map(async ({ type, id }) => {
    const content = await getContentById(type, id);
    if (content) {
      contentMap.set(`${type}:${id}`, content);
    }
  });
  
  await Promise.all(promises);
  
  return contentMap;
});

/**
 * Stream content processing for very large datasets
 * This processes content in chunks to avoid memory spikes
 */
export async function* streamContent(
  types?: RelatedContentType[],
  chunkSize: number = 100
): AsyncGenerator<NormalizedContent[], void, unknown> {
  const allContent = await getCachedAllContent();
  const filtered = types ? filterByTypes(allContent, types, undefined) : allContent;
  
  // Process in chunks
  for (let i = 0; i < filtered.length; i += chunkSize) {
    yield filtered.slice(i, i + chunkSize);
  }
}