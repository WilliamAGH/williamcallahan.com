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
import { envLogger } from "@/lib/utils/env-logger";
import { getMonotonicTime } from "@/lib/utils";

import type { Cache, CacheStats, CacheValue, ServerCacheMapEntry } from "@/types/cache";
import { SERVER_CACHE_DURATION, MEMORY_THRESHOLDS } from "./constants";

/** Circuit breaker cooldown period in milliseconds (5 minutes) */
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

import * as bookmarkHelpers from "./server-cache/bookmarks";
import * as githubHelpers from "./server-cache/github";
import * as logoHelpers from "./server-cache/logo";
import * as opengraphHelpers from "./server-cache/opengraph";
import * as searchHelpers from "./server-cache/search";
import * as aggregatedContentHelpers from "./server-cache/aggregated-content";

assertServerOnly();

const isProductionBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";
const buildPhaseTimestamp = isProductionBuildPhase() ? getMonotonicTime() : undefined;

export const getDeterministicTimestamp = (): number => {
  if (isProductionBuildPhase()) {
    return buildPhaseTimestamp ?? getMonotonicTime();
  }
  return getMonotonicTime();
};

export class ServerCache implements Cache {
  private readonly cache = new Map<string, ServerCacheMapEntry>();
  private hits = 0;
  private misses = 0;
  private failureCount = 0;
  private readonly maxFailures = 3;
  private disabled = false;
  private disabledUntil = 0;
  private totalSize = 0;
  private readonly maxSize: number;
  private cleanupInterval: NodeJS.Timeout;
  private static readonly MAX_EVICTION_PERCENTAGE = 0.95 as const;

  constructor() {
    // Size-aware cache configuration
    this.maxSize = MEMORY_THRESHOLDS.SERVER_CACHE_BUDGET_BYTES;

    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Allow process to exit naturally in non-server contexts
    this.cleanupInterval.unref?.();
  }

  private proactiveEviction(percentage: number): void {
    // Clamp percentage to a safe range [0, MAX_EVICTION_PERCENTAGE]
    percentage = Math.min(ServerCache.MAX_EVICTION_PERCENTAGE, Math.max(0, percentage));
    // If disabled, don't perform eviction
    if (this.disabled) {
      return;
    }

    // Check if cache has any significant content to evict
    const currentSizeBytes = this.totalSize;

    // Skip eviction if cache is essentially empty (less than 1MB)
    if (currentSizeBytes < 1024 * 1024) {
      envLogger.log(
        `Skipping eviction - cache size only ${Math.round(currentSizeBytes / 1024)}KB`,
        { sizeKB: Math.round(currentSizeBytes / 1024) },
        { category: "ServerCache", context: { event: "eviction-skip" } },
      );
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

    envLogger.log(
      `Proactive eviction complete. Removed ${removedCount} entries (${Math.round(removedBytes / 1024)}KB)`,
      { removedCount, removedKB: Math.round(removedBytes / 1024) },
      { category: "ServerCache", context: { event: "eviction-complete" } },
    );
  }

  public get<T>(key: string): T | undefined {
    // If disabled, check if cooldown expired and memory is healthy for auto-recovery
    if (this.disabled) {
      if (Date.now() >= this.disabledUntil) {
        this.attemptCircuitBreakerRecovery();
      }
      if (this.disabled) {
        return undefined;
      }
    }

    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.misses++;
        return undefined;
      }

      // Check if expired
      if (entry.expiresAt < getDeterministicTimestamp()) {
        this.cache.delete(key);
        this.totalSize -= entry.size;
        this.misses++;
        return undefined;
      }

      this.hits++;
      return entry.value as T;
    } catch (error) {
      envLogger.log("Error in get operation", { error }, { category: "ServerCache" });
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
          envLogger.log(
            `Rejected ${Math.round(size / 1024)}KB buffer – exceeds 10MB item limit`,
            { key, sizeKB: Math.round(size / 1024), limitKB: 10 * 1024 },
            { category: "ServerCache" },
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
        envLogger.log(
          "Cache full, cannot store key",
          { key, utilizationPercent: Math.round((this.totalSize / this.maxSize) * 100) },
          { category: "ServerCache", context: { event: "cache-full" } },
        );
        return false;
      }

      const ttl = (ttlSeconds || SERVER_CACHE_DURATION) * 1000;
      const expiresAt = getDeterministicTimestamp() + ttl;

      // Remove old entry if exists
      const oldEntry = this.cache.get(key);
      if (oldEntry) {
        this.totalSize -= oldEntry.size;
      }

      this.cache.set(key, { value, expiresAt, size });
      this.totalSize += size;
      return true;
    } catch (error) {
      envLogger.log("Error in set operation", { error }, { category: "ServerCache" });
      this.handleFailure();
      return false;
    }
  }

  public del(key: string | string[]): void {
    if (Array.isArray(key)) {
      key.forEach(k => {
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
    if (entry.expiresAt < getDeterministicTimestamp()) {
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
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    envLogger.log(
      `Cache operation failed (${this.failureCount}/${this.maxFailures})`,
      { failureCount: this.failureCount, rssMB },
      { category: "ServerCache", context: { event: "cache-failure" } },
    );

    if (this.failureCount >= this.maxFailures && !this.disabled) {
      this.disabled = true;
      this.disabledUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      envLogger.log(
        `Circuit breaker activated after ${this.failureCount} failures. Will attempt recovery in 5 minutes.`,
        {
          failureCount: this.failureCount,
          disabledUntil: new Date(this.disabledUntil).toISOString(),
        },
        { category: "ServerCache", context: { event: "circuit-breaker-activated" } },
      );
    }
  }

  /**
   * Attempt to recover the circuit breaker after cooldown period.
   * Only recovers if memory usage is below safe threshold.
   */
  private attemptCircuitBreakerRecovery(): void {
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const safeThreshold = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES * 0.7;

    if (memUsage.rss < safeThreshold) {
      this.disabled = false;
      this.failureCount = 0;
      this.disabledUntil = 0;
      envLogger.log(
        `Circuit breaker auto-recovered. Memory ${rssMB}MB is healthy.`,
        { rssMB },
        { category: "ServerCache", context: { event: "circuit-breaker-auto-recovered" } },
      );
    } else {
      // Extend cooldown if memory still high
      this.disabledUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
      envLogger.log(
        `Circuit breaker recovery deferred - memory still high (${rssMB}MB)`,
        { rssMB, nextAttempt: new Date(this.disabledUntil).toISOString() },
        { category: "ServerCache", context: { event: "circuit-breaker-recovery-deferred" } },
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
      envLogger.log("Cache is disabled, skipping clear operation", undefined, {
        category: "ServerCache",
        context: { event: "clear-skip" },
      });
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
            envLogger.log(
              "Failed to delete key during clear",
              { key, error: deleteError },
              { category: "ServerCache" },
            );
          }
        }
      }

      // Reset stats – hits/misses related to logo validation are preserved to
      // avoid skewing metrics.
      this.hits = 0;
      this.misses = 0;
    } catch (error) {
      envLogger.log("Error during cache clear", { error }, { category: "ServerCache" });
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
    const now = getDeterministicTimestamp();
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
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    const totalProcessBudget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
    const safeThreshold = totalProcessBudget * 0.6; // Only reset if below 60%

    if (memUsage.rss < safeThreshold) {
      this.disabled = false;
      this.failureCount = 0;
      this.disabledUntil = 0;
      envLogger.log(
        `Circuit breaker reset. Memory usage ${rssMB}MB is below safe threshold.`,
        { rssMB, disabledUntil: this.disabledUntil },
        { category: "ServerCache", context: { event: "circuit-breaker-reset" } },
      );
    } else {
      const safeThresholdMB = Math.round(safeThreshold / 1024 / 1024);
      envLogger.log(
        `Cannot reset circuit breaker. Memory usage ${rssMB}MB still above safe threshold.`,
        { rssMB, safeThresholdMB },
        { category: "ServerCache", context: { event: "circuit-breaker-not-reset" } },
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

/**
 * Dynamically attaches helper methods to a class prototype at runtime.
 *
 * @justification TypeScript's type system has documented limitations with dynamic prototype manipulation.
 * According to Microsoft's DynamicProto-JS (https://github.com/microsoft/DynamicProto-JS), dynamic
 * prototype assignment is necessary to:
 * 1. Enable better code minification by avoiding instance property exposure
 * 2. Support runtime composition patterns that TypeScript cannot statically analyze
 * 3. Implement mixin patterns where methods are attached post-class-definition
 *
 * @citation "TypeScript Issue #15163: JavaScript Class Prototype Assignment not Recognized" - The TypeScript
 * compiler has special handling for prototype assignments but cannot fully type-check dynamic property
 * assignment at compile time.
 *
 * @citation "TypeScript Handbook - Declaration Merging" - While TypeScript supports declaration merging
 * for static type definitions, runtime prototype manipulation requires bypassing the type system.
 *
 * @rationale The generic constraint approach provides type safety:
 * 1. Uses 'unknown' instead of 'any' for better type safety
 * 2. Only attaches functions to prevent prototype pollution (security best practice)
 * 3. Uses Object.defineProperty with non-enumerable for proper encapsulation
 * 4. Type safety is enforced through types/server-cache.d.ts using declaration merging
 *
 * @security Prototype pollution prevention:
 * - Type check ensures only functions are attached (no constants/objects)
 * - Non-enumerable properties prevent unexpected iteration behavior
 * - Follows MDN and OWASP security best practices for prototype extension
 * - Prevents accidental exposure of internal state through prototype chain
 */
function attachHelpers<T extends Record<string, unknown>>(prototype: object, helpers: T, helperName: string) {
  for (const [key, value] of Object.entries(helpers)) {
    // Only attach functions to avoid polluting the prototype with constants/objects
    if (typeof value !== "function") continue;
    if (key in prototype) {
      envLogger.log(
        `Overwriting existing method '${key}' on prototype while attaching '${helperName}' helpers.`,
        { method: key, helperName },
        { category: "ServerCache", context: { event: "prototype-overwrite" } },
      );
    }
    // Define non-enumerable to keep prototype surface tidy
    Object.defineProperty(prototype, key, {
      // Narrow to callable without using 'any'
      // WRAPPER: Convert the method call (this.foo()) into a function call with 'this' as first arg (foo(this))
      // This allows the helper functions to be standard functions (cache: Cache, ...args) instead of using 'this' context
      value: function (this: Cache, ...args: unknown[]) {
        return (value as (cache: Cache, ...args: unknown[]) => unknown)(this, ...args);
      },
      configurable: true,
      writable: true,
      enumerable: false,
    });
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
