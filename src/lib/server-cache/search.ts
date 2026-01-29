/**
 * @module lib/server-cache/search
 * @description Domain-specific cache methods for search results.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { SearchCacheEntry, ICache } from "@/types/cache";
import { SEARCH_CACHE_DURATION } from "@/lib/constants";
import { getMonotonicTime } from "@/lib/utils";

const SEARCH_PREFIX = "search:";
const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getCacheTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

function getSearchKey(dataType: string, query: string): string {
  return `${SEARCH_PREFIX}${dataType}:${query.toLowerCase()}`;
}

export function getSearchResults<T = unknown>(
  cache: ICache,
  dataType: string,
  query: string,
): SearchCacheEntry<T> | undefined {
  const key = getSearchKey(dataType, query);
  return cache.get<SearchCacheEntry<T>>(key);
}

export function setSearchResults<T>(cache: ICache, dataType: string, query: string, results: T[]): void {
  const key = getSearchKey(dataType, query);
  const entry: SearchCacheEntry<T> = {
    results,
    query,
    dataType,
    timestamp: getCacheTimestamp(),
  };
  cache.set(key, entry, SEARCH_CACHE_DURATION.SUCCESS);
}

export function shouldRefreshSearch(cache: ICache, dataType: string, query: string): boolean {
  const cached = getSearchResults(cache, dataType, query);
  if (!cached) {
    return true;
  }
  const timeSinceLastFetch = getCacheTimestamp() - cached.timestamp;
  return timeSinceLastFetch > SEARCH_CACHE_DURATION.REVALIDATION * 1000;
}

export function clearSearchCache(cache: ICache, dataType?: string): void {
  const prefix = dataType ? `${SEARCH_PREFIX}${dataType}:` : SEARCH_PREFIX;
  const keys = cache.keys().filter(key => key.startsWith(prefix));
  for (const key of keys) {
    cache.del(key);
  }
}
