/**
 * @module lib/server-cache
 * @description Provides a singleton, unified, in-memory caching service.
 * This class is built on `lru-cache` for consistent, memory-aware caching
 * across the application. It replaces the previous `node-cache`-based implementation.
 *
 * Domain-specific methods (for bookmarks, logos, etc.) are attached to this
 * class's prototype from files in the `lib/server-cache/` directory.
 */

import { LRUCache } from "lru-cache";
import { assertServerOnly } from "./utils";
import "./server/mem-guard";

import type { ICache, CacheStats, CacheValue, StorableCacheValue } from "@/types/cache";
import { SERVER_CACHE_DURATION } from "./constants";

import * as bookmarkHelpers from "./server-cache/bookmarks";
import * as githubHelpers from "./server-cache/github";
import * as logoHelpers from "./server-cache/logo";
import * as opengraphHelpers from "./server-cache/opengraph";
import * as searchHelpers from "./server-cache/search";

assertServerOnly();

export class ServerCache implements ICache {
  private readonly cache: LRUCache<string, StorableCacheValue>;
  private hits = 0;
  private misses = 0;

  constructor() {
    this.cache = new LRUCache<string, StorableCacheValue>({
      max: 100000,
      ttl: SERVER_CACHE_DURATION * 1000, // lru-cache uses milliseconds
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
      dispose: (_value, key, reason) => {
        if (reason === "evict") {
          console.warn(`[ServerCache] Evicting key due to max size limit: ${key}`);
        }
      },
    });
  }

  public get<T>(key: string): T | undefined {
    const value = this.cache.get(key) as T | undefined;
    if (value !== undefined) {
      this.hits++;
    } else {
      this.misses++;
    }
    return value;
  }

  public set<T extends CacheValue>(key: string, value: T, ttlSeconds?: number): boolean {
    // Handle null values by not storing them (they'll return undefined on get)
    if (value === null) {
      return true; // Treat null as successfully "stored" but don't actually store it
    }

    if (Buffer.isBuffer(value) && value.byteLength > 10 * 1024 * 1024) {
      console.warn(`[ServerCache] Rejected large buffer for key: ${key}`);
      return false;
    }

    const ttl = ttlSeconds ? ttlSeconds * 1000 : undefined;
    this.cache.set(key, value, { ttl });
    return true;
  }

  public del(key: string | string[]): void {
    if (Array.isArray(key)) {
      key.forEach((k) => this.cache.delete(k));
    } else {
      this.cache.delete(key);
    }
  }

  public keys(): string[] {
    return [...this.cache.keys()];
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public getStats(): CacheStats {
    return {
      keys: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      ksize: 0, // lru-cache does not track key/value sizes by default
      vsize: 0,
    };
  }

  public clearAllCaches(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public flushAll(): void {
    this.clearAllCaches();
  }
}

// Attach domain-specific methods to the ServerCache prototype
Object.assign(ServerCache.prototype, bookmarkHelpers);
Object.assign(ServerCache.prototype, githubHelpers);
Object.assign(ServerCache.prototype, logoHelpers);
Object.assign(ServerCache.prototype, opengraphHelpers);
Object.assign(ServerCache.prototype, searchHelpers);

// Export a singleton instance
export const ServerCacheInstance = new ServerCache();
