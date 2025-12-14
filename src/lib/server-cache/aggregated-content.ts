/**
 * @module lib/server-cache/aggregated-content
 * @description Domain-specific cache methods for aggregated content used in similarity matching.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { ICache } from "@/types/cache";
import type { AggregatedContentCacheEntry, RelatedContentCacheData } from "@/types/related-content";

const AGGREGATED_CONTENT_KEY = "aggregated-content:all";
const RELATED_CONTENT_PREFIX = "related-content:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - content changes infrequently

/**
 * Get cached aggregated content
 */
export function getAggregatedContent(this: ICache): AggregatedContentCacheEntry | undefined {
  return this.get<AggregatedContentCacheEntry>(AGGREGATED_CONTENT_KEY);
}

/**
 * Set aggregated content in cache
 */
export function setAggregatedContent(this: ICache, entry: AggregatedContentCacheEntry): boolean {
  // Cache for 24 hours - content changes infrequently
  return this.set(AGGREGATED_CONTENT_KEY, entry, CACHE_TTL_MS);
}

/**
 * Clear aggregated content cache
 */
export function clearAggregatedContent(this: ICache): void {
  this.del(AGGREGATED_CONTENT_KEY);
}

/**
 * Get cached related content for a specific source
 */
export function getRelatedContent(
  this: ICache,
  sourceType: string,
  sourceId: string,
): RelatedContentCacheData | undefined {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  return this.get<RelatedContentCacheData>(key);
}

/**
 * Set related content in cache
 */
export function setRelatedContent(
  this: ICache,
  sourceType: string,
  sourceId: string,
  entry: RelatedContentCacheData,
): boolean {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  // Cache for 24 hours - content changes infrequently
  return this.set(key, entry, CACHE_TTL_MS);
}

/**
 * Clear related content cache for a specific source
 */
export function clearRelatedContent(this: ICache, sourceType: string, sourceId: string): void {
  const key = `${RELATED_CONTENT_PREFIX}${sourceType}:${sourceId}`;
  this.del(key);
}

/**
 * Clear all related content caches
 */
export function clearAllRelatedContent(this: ICache): void {
  const keys = this.keys();
  const relatedKeys = keys.filter(key => key.startsWith(RELATED_CONTENT_PREFIX));
  if (relatedKeys.length > 0) {
    this.del(relatedKeys);
  }
}
