/**
 * @module lib/server-cache
 * @description Provides a singleton, unified, in-memory caching service.
 * This class uses a simple Map-based implementation with TTL and size-aware eviction.
 * It uses request coalescing and memory-aware eviction strategies.
 *
 * Domain-specific methods (for bookmarks, logos, etc.) are attached to this
 * class's prototype from files in the `lib/server-cache/` directory.
 */
import { assertServerOnly } from "./utils";

import type { ICache, CacheStats, CacheValue, ServerCacheMapEntry } from "@/types/cache";
import { SERVER_CACHE_DURATION, MEMORY_THRESHOLDS } from "./constants";

import * as bookmarkHelpers from "./server-cache/bookmarks";
import * as githubHelpers from "./server-cache/github";
import * as logoHelpers from "./server-cache/logo";
import * as opengraphHelpers from "./server-cache/opengraph";
import * as searchHelpers from "./server-cache/search";
import * as aggregatedContentHelpers from "./server-cache/aggregated-content";

assertServerOnly();

export class ServerCache implements ICache {
  private readonly cache = new Map<string, ServerCacheMapEntry>();
  private hits = 0;
  private misses = 0;
  private failureCount = 0;
  private readonly maxFailures = 3;
  private disabled = false;
  private totalSize = 0;
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Size-aware cache configuration
    this.maxSize = MEMORY_THRESHOLDS.SERVER_CACHE_BUDGET_BYTES;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private proactiveEviction(percentage: number): void {
    // If disabled, don't perform eviction
    if (this.disabled) {
      return;
    }

    // Check if cache has any significant content to evict
    const currentSizeBytes = this.totalSize;

    // Skip eviction if cache is essentially empty (less than 1MB)
    if (currentSizeBytes < 1024 * 1024) {
      console.log(`[ServerCache] Skipping eviction - cache size only ${Math.round(currentSizeBytes / 1024)}KB`);
      return;
    }

    // Use memory-based eviction instead of count-based
    const targetSizeBytes = Math.floor(currentSizeBytes * (1 - percentage));
    let removedBytes = 0;
    let removedCount = 0;

    // Remove oldest items until we reach target size
    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (this.totalSize <= targetSizeBytes) break;

      this.cache.delete(key);
      this.totalSize -= entry.size;
      removedBytes += entry.size;
      removedCount++;
    }

    console.log(
      `[ServerCache] Proactive eviction complete. Removed ${removedCount} entries (${Math.round(removedBytes / 1024)}KB)`,
    );
  }

  public get<T>(key: string): T | undefined {
    // If disabled, return undefined - let the system work without cache
    if (this.disabled) {
      return undefined;
    }

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.misses++;
        return undefined;
      }

      // Check if expired
      if (entry.expiresAt < Date.now()) {
        this.cache.delete(key);
        this.totalSize -= entry.size;
        this.misses++;
        return undefined;
      }

      this.hits++;
      return entry.value as T;
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

      // Calculate size
      let size = 0;
      if (Buffer.isBuffer(value)) {
        size = value.byteLength;
        if (size > 10 * 1024 * 1024) {
          console.warn(
            `[ServerCache] Rejected ${Math.round(size / 1024)}KB buffer (key="${key}") – exceeds 10MB item limit`,
          );
          return false;
        }
      } else if (typeof value === "string") {
        size = value.length * 2; // JS strings are UTF-16
      } else {
        // For objects, use JSON stringification as estimate
        try {
          size = JSON.stringify(value).length * 2;
        } catch {
          size = 1024; // 1KB default
        }
      }

      // Check if we need to evict to make space
      if (this.totalSize + size > this.maxSize) {
        this.proactiveEviction(0.25); // Remove 25% to make space
      }

      // If still too big after eviction, reject
      if (this.totalSize + size > this.maxSize) {
        console.warn(`[ServerCache] Cache full, cannot store key: ${key}`);
        return false;
      }

      const ttl = (ttlSeconds || SERVER_CACHE_DURATION) * 1000;
      const expiresAt = Date.now() + ttl;

      // Remove old entry if exists
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.totalSize -= oldEntry.size;
      }

      this.cache.set(key, { value, expiresAt, size });
      this.totalSize += size;
      return true;
    } catch (error) {
      console.error("[ServerCache] Error in set operation:", error);
      this.handleFailure();
      return false;
    }
  }

  public del(key: string | string[]): void {
    if (Array.isArray(key)) {
      key.forEach((k) => {
        const entry = this.cache.get(k);
        if (entry && typeof entry === "object" && "size" in entry) {
          this.cache.delete(k);
          this.totalSize -= entry.size;
        }
      });
    } else {
      const entry = this.cache.get(key);
      if (entry && typeof entry === "object" && "size" in entry) {
        this.cache.delete(key);
        this.totalSize -= entry.size;
      }
    }
  }

  public keys(): string[] {
    return [...this.cache.keys()];
  }

  public has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry || typeof entry !== "object" || !("expiresAt" in entry) || !("size" in entry)) {
      return false;
    }

    // Check if expired
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.totalSize -= entry.size;
      return false;
    }

    return true;
  }

  public getStats(): CacheStats {
    return {
      keys: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      ksize: 0,
      vsize: this.totalSize,
      sizeBytes: this.totalSize,
      maxSizeBytes: this.maxSize,
      utilizationPercent: this.maxSize > 0 ? (this.totalSize / this.maxSize) * 100 : 0,
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
        `[ServerCache] Circuit breaker activated after ${this.failureCount} failures. Cache operations disabled to prevent system instability.`,
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
      for (const [key, entry] of this.cache.entries()) {
        if (!key.startsWith(LOGO_VALIDATION_PREFIX)) {
          try {
            this.cache.delete(key);
            if (entry && typeof entry === "object" && "size" in entry) {
              this.totalSize -= entry.size;
            }
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
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        this.totalSize -= entry.size;
      }
    }
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
        `[ServerCache] Circuit breaker reset. Memory usage ${Math.round(memUsage.rss / 1024 / 1024)}MB is below safe threshold.`,
      );
    } else {
      console.warn(
        `[ServerCache] Cannot reset circuit breaker. Memory usage ${Math.round(memUsage.rss / 1024 / 1024)}MB still above safe threshold.`,
      );
    }
  }

  /**
   * Destroy the cache instance and clean up timers
   */
  public destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}

function attachHelpers(prototype: any, helpers: Record<string, any>, helperName: string) {
  for (const key in helpers) {
    if (Object.prototype.hasOwnProperty.call(helpers, key)) {
      if (key in prototype) {
        console.warn(`[ServerCache] Overwriting existing method '${key}' on prototype while attaching '${helperName}' helpers.`);
      }
      prototype[key] = helpers[key];
    }
  }
}

// Attach domain-specific methods to the ServerCache prototype
attachHelpers(ServerCache.prototype, bookmarkHelpers, "bookmark");
attachHelpers(ServerCache.prototype, githubHelpers, "github");
attachHelpers(ServerCache.prototype, logoHelpers, "logo");
attachHelpers(ServerCache.prototype, opengraphHelpers, "opengraph");
attachHelpers(ServerCache.prototype, searchHelpers, "search");
attachHelpers(ServerCache.prototype, aggregatedContentHelpers, "aggregatedContent");

// Export a singleton instance
export const ServerCacheInstance = new ServerCache();
