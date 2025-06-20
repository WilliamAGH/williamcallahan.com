import { LRUCache } from "lru-cache";
import type { CacheValue, StorableCacheValue } from "@/types/cache";

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  DEFAULT: 30 * 24 * 60 * 60, // 30 days
  DAILY: 24 * 60 * 60, // 24 hours
  HOURLY: 60 * 60, // 1 hour
};

// Create a cache instance with a default TTL
const cache = new LRUCache<string, StorableCacheValue>({
  max: 500, // Modest limit for this utility cache
  ttl: CACHE_TTL.DEFAULT * 1000, // lru-cache uses milliseconds
});

// We need to wrap the LRUCache to provide the same API as the old node-cache,
// specifically for getStats and del/flushAll.

let hits = 0;
let misses = 0;

const getStats = () => ({
  keys: cache.size,
  hits,
  misses,
  ksize: 0,
  vsize: 0,
});

const set = (key: string, value: CacheValue, ttlSeconds?: number) => {
  // Handle null values by not storing them (they'll return undefined on get)
  if (value === null) {
    return true; // Treat null as successfully "stored" but don't actually store it
  }

  const options = ttlSeconds ? { ttl: ttlSeconds * 1000 } : {};
  return cache.set(key, value, options);
};

const get = (key: string): CacheValue | undefined => {
  const value = cache.get(key);
  if (value !== undefined) {
    hits++;
  } else {
    misses++;
  }
  return value;
};

const del = (key: string) => cache.delete(key);
const flushAll = () => {
  cache.clear();
  hits = 0;
  misses = 0;
};

export const cacheWrapper = {
  set,
  get,
  del,
  flushAll,
  getStats,
};

export { cacheWrapper as cache };
