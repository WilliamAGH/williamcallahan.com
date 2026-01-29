/**
 * @module lib/server-cache/aggregated-content
 * @description Domain-specific cache methods for aggregated content used in similarity matching.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { Cache } from "@/types/cache";
import type { AggregatedContentCacheEntry, RelatedContentCacheData } from "@/types/related-content";

const AGGREGATED_CONTENT_KEY = "aggregated-content:all";
const RELATED_CONTENT_PREFIX = "related-content:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - content changes infrequently

/**
 * Get cached aggregated content
 */
export function getAggregatedContent(cache: Cache): AggregatedContentCacheEntry | undefined {
  return cache.get<AggregatedContentCacheEntry>(AGGREGATED_CONTENT_KEY);
}

/**
 * Set aggregated content in cache
 */
export function setAggregatedContent(cache: Cache, entry: AggregatedContentCacheEntry): boolean {
  // Cache for 24 hours - content changes infrequently
  return cache.set(AGGREGATED_CONTENT_KEY, entry, CACHE_TTL_MS);
}

/**
 * Clear aggregated content cache
 */
export function clearAggregatedContent(cache: Cache): void {
  cache.del(AGGREGATED_CONTENT_KEY);
}

/**
 * Get cached related content for a specific source
 */
export function getRelatedContent(
  cache: Cache,
  sourceType: string,
  sourceId: string,
): RelatedContentCacheData | undefined {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  return cache.get<RelatedContentCacheData>(key);
}

/**
 * Set related content in cache
 */
export function setRelatedContent(
  cache: Cache,
  sourceType: string,
  sourceId: string,
  entry: RelatedContentCacheData,
): boolean {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  // Cache for 24 hours - content changes infrequently
  return cache.set(key, entry, CACHE_TTL_MS);
}

/**
 * Clear related content cache for a specific source
 */
export function clearRelatedContent(cache: Cache, sourceType: string, sourceId: string): void {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  cache.del(key);
}

/**
 * Clear all related content caches
 */
export function clearAllRelatedContent(cache: Cache): void {
  const keys = cache.keys();
  const relatedKeys = keys.filter(key => key.startsWith(RELATED_CONTENT_PREFIX));
  if (relatedKeys.length > 0) {
    cache.del(relatedKeys);
  }
}
