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
  private failureCount = 0;
  private readonly maxFailures = 3;
  private disabled = false;

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
    // If disabled, don't perform eviction
    if (this.disabled) {
      return;
    }

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
    // If disabled, return undefined - let the system work without cache
    if (this.disabled) {
      return undefined;
    }

    try {
      const value = this.cache.get(key) as T | undefined;
      if (value !== undefined) {
        this.hits++;
      } else {
        this.misses++;
      }
      return value;
    } catch (error) {
      console.error("[ServerCache] Error in get operation:", error);
      this.handleFailure();
      return undefined;
    }
  }

  public set<T extends CacheValue>(key: string, value: T, ttlSeconds?: number): boolean {
    // If disabled, silently fail - let the system work without cache
    if (this.disabled) {
      return false;
    }

    try {
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
    } catch (error) {
      console.error("[ServerCache] Error in set operation:", error);
      this.handleFailure();
      return false;
    }
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
   * Handle cache operation failures - increment counter and disable after threshold
   */
  private handleFailure(): void {
    this.failureCount++;
    
    if (this.failureCount >= this.maxFailures && !this.disabled) {
      this.disabled = true;
      console.warn(
        `[ServerCache] Circuit breaker activated after ${this.failureCount} failures. Cache operations disabled to prevent system instability.`
      );
    }
  }

  /**
   * Clear all cache entries except logo validation results.
   * Logo validation entries are preserved to prevent repeated Sharp image processing.
   * Now includes error handling to prevent crashes during cleanup.
   */
  public clearAllCaches(): void {
    // If disabled, don't attempt cleanup
    if (this.disabled) {
      console.warn("[ServerCache] Cache is disabled, skipping clear operation");
      return;
    }

    try {
      const LOGO_VALIDATION_PREFIX = "logo-validation:";

      // Iterate over keys and **only** remove those that are *not* part of the
      // logo-validation cache.  Those entries are tiny (a boolean + timestamp)
      // yet extremely helpful in preventing repeated Sharp work after a flush.
      for (const key of this.cache.keys()) {
        if (!key.startsWith(LOGO_VALIDATION_PREFIX)) {
          try {
            this.cache.delete(key);
          } catch (deleteError) {
            console.error(`[ServerCache] Failed to delete key ${key}:`, deleteError);
          }
        }
      }

      // Reset stats – hits/misses related to logo validation are preserved to
      // avoid skewing metrics.
      this.hits = 0;
      this.misses = 0;
    } catch (error) {
      console.error("[ServerCache] Error during cache clear:", error);
      this.handleFailure();
    }
  }

  public flushAll(): void {
    this.clearAllCaches();
  }

  /**
   * Reset the circuit breaker - use with caution
   * This should only be called after memory conditions have improved significantly
   */
  public resetCircuitBreaker(): void {
    const memUsage = process.memoryUsage();
    const totalProcessBudget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
    const safeThreshold = totalProcessBudget * 0.6; // Only reset if below 60%
    
    if (memUsage.rss < safeThreshold) {
      this.disabled = false;
      this.failureCount = 0;
      console.log(
        `[ServerCache] Circuit breaker reset. Memory usage ${Math.round(memUsage.rss / 1024 / 1024)}MB is below safe threshold.`
      );
    } else {
      console.warn(
        `[ServerCache] Cannot reset circuit breaker. Memory usage ${Math.round(memUsage.rss / 1024 / 1024)}MB still above safe threshold.`
      );
    }
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
