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

import type { ICache, CacheStats, CacheValue, StorableCacheValue } from "@/types/cache";
import { SERVER_CACHE_DURATION, MEMORY_THRESHOLDS } from "./constants";

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
    // Size-aware cache configuration
    const maxSizeBytes = MEMORY_THRESHOLDS.SERVER_CACHE_BUDGET_BYTES;

    this.cache = new LRUCache<string, StorableCacheValue>({
      max: 100000,
      maxSize: maxSizeBytes,
      sizeCalculation: (value) => {
        // Estimate memory usage for different value types
        if (Buffer.isBuffer(value)) {
          return value.byteLength;
        }
        if (typeof value === "string") {
          return value.length * 2; // JS strings are UTF-16
        }
        // For objects, use JSON stringification as estimate
        try {
          return JSON.stringify(value).length * 2;
        } catch {
          // If circular reference or other issue, use conservative estimate
          return 1024; // 1KB default
        }
      },
      ttl: SERVER_CACHE_DURATION * 1000, // lru-cache uses milliseconds
      allowStale: false,
      updateAgeOnGet: false,
      updateAgeOnHas: false,
      dispose: (_value, key, reason) => {
        if (reason === "evict" || reason === "set") {
          console.log(`[ServerCache] Evicting key (${reason}): ${key}`);
        }
      },
    });

    // Set up memory coordination listener if in Node.js runtime
    if (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "nodejs") {
      this.setupMemoryCoordination();
    }
  }

  private setupMemoryCoordination(): void {
    // Dynamically import to avoid issues in non-Node environments
    import("@/lib/image-memory-manager")
      .then(({ ImageMemoryManagerInstance }) => {
        // Listen for memory coordination trigger from ImageMemoryManager
        ImageMemoryManagerInstance.on("memory-coordination-trigger", () => {
          console.log("[ServerCache] Received memory coordination trigger, clearing 25% of cache");
          this.proactiveEviction(0.25); // Clear 25% of cache
        });
      })
      .catch((err) => {
        console.warn("[ServerCache] Failed to set up memory coordination:", err);
      });
  }

  private proactiveEviction(percentage: number): void {
    // Check if cache has any significant content to evict
    const currentSizeBytes = this.cache.calculatedSize || 0;
    
    // Skip eviction if cache is essentially empty (less than 1MB)
    if (currentSizeBytes < 1024 * 1024) {
      console.log(`[ServerCache] Skipping eviction - cache size only ${Math.round(currentSizeBytes / 1024)}KB`);
      return;
    }

    // Use memory-based eviction instead of count-based
    const targetSizeBytes = Math.floor(currentSizeBytes * (1 - percentage));
    let removedBytes = 0;
    let removedCount = 0;

    // Remove items until we reach target size
    for (const key of this.cache.keys()) {
      if (currentSizeBytes - removedBytes <= targetSizeBytes) break;
      
      // Get size before deletion
      const sizeBefore = this.cache.calculatedSize || 0;
      this.cache.delete(key);
      const sizeAfter = this.cache.calculatedSize || 0;
      removedBytes += (sizeBefore - sizeAfter);
      removedCount++;
    }

    console.log(`[ServerCache] Proactive eviction complete. Removed ${removedCount} entries (${Math.round(removedBytes / 1024)}KB)`);
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
    const size = this.cache.size;
    const calculatedSize = this.cache.calculatedSize || 0;
    const maxSize = (this.cache as LRUCache<string, StorableCacheValue> & { maxSize?: number }).maxSize || 0;

    return {
      keys: size,
      hits: this.hits,
      misses: this.misses,
      ksize: 0, // lru-cache does not track key/value sizes by default
      vsize: calculatedSize, // Now tracking total size in bytes
      sizeBytes: calculatedSize,
      maxSizeBytes: maxSize,
      utilizationPercent: maxSize > 0 ? (calculatedSize / maxSize) * 100 : 0,
    };
  }

  /**
   * Clear all cache entries except logo validation results.
   * Logo validation entries are preserved to prevent repeated Sharp image processing.
   */
  public clearAllCaches(): void {
    const LOGO_VALIDATION_PREFIX = "logo-validation:";

    // Iterate over keys and **only** remove those that are *not* part of the
    // logo-validation cache.  Those entries are tiny (a boolean + timestamp)
    // yet extremely helpful in preventing repeated Sharp work after a flush.
    for (const key of this.cache.keys()) {
      if (!key.startsWith(LOGO_VALIDATION_PREFIX)) {
        this.cache.delete(key);
      }
    }

    // Reset stats – hits/misses related to logo validation are preserved to
    // avoid skewing metrics.
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
