/**
 * Central Image Memory Manager
 *
 * Consolidates all image buffer handling with memory-aware caching.
 * Prevents memory leaks through:
 * - Size limits (50MB per image, 512MB total budget)
 * - TTL-based eviction (30 days)
 * - Proper buffer copying (no Buffer.slice() retention)
 * - Memory pressure detection with automatic cleanup
 * - Request coalescing to prevent duplicate fetches
 *
 * @module lib/image-memory-manager
 */

import { EventEmitter } from "node:events";
import { LRUCache } from "lru-cache";
import type { ImageCacheEntry } from "@/types/cache";
import type { ImageMemoryMetrics } from "@/types/image";
import { MEMORY_THRESHOLDS } from "@/lib/constants";

/**
 * Central image memory management with LRU cache and memory pressure detection.
 *
 * Features:
 * - LRU eviction with size-aware cache (512MB default budget)
 * - Automatic memory pressure detection at RSS/heap thresholds
 * - Request coalescing prevents duplicate concurrent fetches
 * - Buffer copying prevents parent buffer retention
 * - Emergency cleanup when memory critical
 *
 * @fires ImageMemoryManager#image-disposed When buffer evicted
 * @fires ImageMemoryManager#memory-pressure-start When entering pressure mode
 * @fires ImageMemoryManager#memory-pressure-end When pressure resolved
 * @fires ImageMemoryManager#buffer-rejected When buffer rejected
 * @fires ImageMemoryManager#metrics Regular memory metrics
 */
export class ImageMemoryManager extends EventEmitter {
  private readonly cache: LRUCache<string, Buffer, unknown>;
  private readonly metadataCache: LRUCache<string, Omit<ImageCacheEntry, "buffer">, unknown>;
  private readonly inFlightFetches = new Map<string, Promise<Buffer>>();
  private memoryPressure = false;
  private readonly maxBufferSize: number;
  private readonly memoryCheckInterval: NodeJS.Timeout;

  constructor() {
    super();

    // Configuration from environment
    const budget = MEMORY_THRESHOLDS.IMAGE_RAM_BUDGET_BYTES;
    this.maxBufferSize = Number(process.env.MAX_IMAGE_SIZE_BYTES ?? 50 * 1024 * 1024); // 50MB max per image

    // Validate configuration
    if (budget <= 0 || Number.isNaN(budget)) {
      throw new Error("[ImageMemory] IMAGE_RAM_BUDGET_BYTES must be a positive number");
    }
    if (this.maxBufferSize <= 0 || Number.isNaN(this.maxBufferSize)) {
      throw new Error("[ImageMemory] MAX_IMAGE_SIZE_BYTES must be a positive number");
    }
    if (this.maxBufferSize > budget * 0.2) {
      console.warn(`[ImageMemory] MAX_IMAGE_SIZE_BYTES (${this.maxBufferSize}) is more than 20% of budget (${budget})`);
    }

    // Primary image buffer cache
    const cacheOptions = {
      max: 5000, // Max number of items
      maxSize: budget,
      sizeCalculation: (buffer: Buffer): number => buffer.byteLength,
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days

      // Critical: Help GC by explicitly handling disposal
      dispose: (value: Buffer, key: string, reason: "evict" | "delete" | "set" | "expire" | "fetch"): void => {
        if (reason === "evict" || reason === "delete") {
          // Log disposal for monitoring
          console.log(`[ImageMemory] Disposed ${key} (${value.byteLength} bytes) - ${reason}`);
          this.emit("image-disposed", { key, size: value.byteLength, reason });
        }
      },

      updateAgeOnGet: true,
      updateAgeOnHas: false,
    };
    this.cache = new LRUCache(cacheOptions);

    // Metadata cache with size limit to prevent unbounded growth
    const metadataCacheOptions = {
      max: 10000, // Max number of entries
      maxSize: 50 * 1024 * 1024, // 50MB max for metadata
      sizeCalculation: (value: Omit<ImageCacheEntry, "buffer">): number => {
        // Estimate size of metadata object
        const baseSize = 100; // Base object overhead
        const contentTypeSize = value.contentType?.length ?? 0;
        const sourceSize = 10; // enum value
        const s3KeySize = value.s3Key?.length ?? 0;
        const cdnUrlSize = value.cdnUrl?.length ?? 0;

        return baseSize + contentTypeSize + sourceSize + s3KeySize + cdnUrlSize;
      },
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      dispose: (_value: Omit<ImageCacheEntry, "buffer">, key: string, reason: string): void => {
        if (reason === "evict" || reason === "size") {
          console.log(`[ImageMemory] Metadata evicted for ${key} - ${reason}`);
        }
      },
    };
    this.metadataCache = new LRUCache(metadataCacheOptions);

    // Start memory monitoring
    this.memoryCheckInterval = this.startMemoryMonitoring();
  }

  /**
   * Get image from cache with memory pressure awareness
   */
  async get(key: string): Promise<ImageCacheEntry | null> {
    // Check memory pressure first
    if (this.memoryPressure) {
      this.emit("memory-pressure", { key, action: "get-rejected" });
      return null;
    }

    // Check if we have the buffer in cache
    const buffer = this.cache.get(key);
    const metadata = this.metadataCache.get(key);

    if (buffer && metadata) {
      return {
        buffer,
        ...metadata,
      };
    }

    // Check if fetch is already in progress (request coalescing)
    if (this.inFlightFetches.has(key)) {
      try {
        const fetchPromise = this.inFlightFetches.get(key);
        if (!fetchPromise) return null;
        const buffer = await fetchPromise;
        const metadata = this.metadataCache.get(key);
        if (metadata) {
          return { buffer, ...metadata };
        }
      } catch (error) {
        // Fetch failed, return null
        console.warn(
          `[ImageMemory] In-flight fetch for ${key} failed:`,
          error instanceof Error ? error.message : String(error),
        );
        return null;
      }
    }

    return null;
  }

  /**
   * Set image in cache with size validation and buffer copying
   */
  set(key: string, buffer: Buffer, metadata: Omit<ImageCacheEntry, "buffer" | "timestamp">): boolean {
    // Validate buffer size
    if (buffer.byteLength > this.maxBufferSize) {
      console.warn(`[ImageMemory] Rejected oversized buffer ${key}: ${buffer.byteLength} bytes`);
      this.emit("buffer-rejected", {
        key,
        size: buffer.byteLength,
        reason: "size-limit",
      });
      return false;
    }

    // Reject if in memory pressure
    if (this.memoryPressure) {
      this.emit("memory-pressure", {
        key,
        action: "set-rejected",
        size: buffer.byteLength,
      });
      return false;
    }

    // CRITICAL: Create a copy to avoid slice() retention issues
    // This ensures we don't hold references to larger parent buffers
    const copy = Buffer.from(buffer);

    try {
      // Store buffer and metadata separately
      this.cache.set(key, copy);
      const metadataToCache: Omit<ImageCacheEntry, "buffer"> = {
        ...metadata,
        timestamp: Date.now(),
      };
      this.metadataCache.set(key, metadataToCache);

      this.emit("image-cached", { key, size: copy.byteLength });
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[ImageMemory] Failed to cache ${key}:`, error);
      this.emit("cache-error", { key, error });
      return false;
    }
  }

  /**
   * Register an in-flight fetch to prevent duplicate requests
   */
  registerFetch(key: string, fetchPromise: Promise<Buffer>): void {
    if (this.inFlightFetches.size >= 1000) {
      console.warn(`[ImageMemory] In-flight fetch limit reached, rejecting new fetch for ${key}`);
      return;
    }
    this.inFlightFetches.set(key, fetchPromise);

    // Clean up after completion
    fetchPromise
      .finally(() => {
        this.inFlightFetches.delete(key);
      })
      .catch(() => {
        // Silently handle - errors are handled by caller
      });
  }

  /**
   * Check if a fetch is in progress
   */
  isFetching(key: string): boolean {
    return this.inFlightFetches.has(key);
  }

  /**
   * Get current fetch promise if exists
   */
  getFetchPromise(key: string): Promise<Buffer> | undefined {
    return this.inFlightFetches.get(key);
  }

  /**
   * Clear specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
    this.metadataCache.delete(key);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.cache.clear();
    this.metadataCache.clear();
    this.inFlightFetches.clear();
  }

  /**
   * Get current metrics
   */
  getMetrics(): ImageMemoryMetrics {
    const memUsage = process.memoryUsage();
    return {
      cacheSize: this.cache.size,
      cacheBytes: this.cache.calculatedSize ?? 0,
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      memoryPressure: this.memoryPressure,
    };
  }

  /**
   * Set memory pressure mode explicitly
   * Used by mem-guard for progressive threshold management
   */
  setMemoryPressure(pressure: boolean): void {
    if (this.memoryPressure === pressure) return;

    this.memoryPressure = pressure;

    if (pressure) {
      console.warn("[ImageMemory] Memory pressure mode enabled by external monitor");
      this.emit("memory-pressure-start", {
        rss: process.memoryUsage().rss,
        heap: process.memoryUsage().heapUsed,
        source: "external",
      });
    } else {
      console.log("[ImageMemory] Memory pressure mode disabled by external monitor");
      this.emit("memory-pressure-end", {
        rss: process.memoryUsage().rss,
        heap: process.memoryUsage().heapUsed,
        source: "external",
      });
    }
  }

  /**
   * Start memory monitoring with multi-level thresholds
   */
  private startMemoryMonitoring(): NodeJS.Timeout {
    const interval = setInterval(() => {
      const usage = process.memoryUsage();
      const budget = MEMORY_THRESHOLDS.IMAGE_RAM_BUDGET_BYTES;

      // Multi-level thresholds
      const rssThreshold = Number(process.env.IMAGE_RSS_THRESHOLD ?? 1.5 * 1024 * 1024 * 1024); // 1.5GB
      const heapThreshold = Number(process.env.IMAGE_HEAP_THRESHOLD ?? 0.85 * usage.heapTotal);

      // Enter memory pressure if thresholds exceeded
      if (usage.rss > rssThreshold || usage.heapUsed > heapThreshold) {
        if (!this.memoryPressure) {
          this.memoryPressure = true;
          console.warn("[ImageMemory] Memory pressure detected - entering protective mode");
          this.emit("memory-pressure-start", {
            rss: usage.rss,
            heap: usage.heapUsed,
            rssThreshold,
            heapThreshold,
          });

          // Aggressive cleanup when entering pressure
          const targetSize = Math.floor(budget * 0.5); // Clear to 50% of budget
          while ((this.cache.calculatedSize ?? 0) > targetSize && this.cache.size > 0) {
            // LRU will evict oldest items
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (oldestKey) {
              this.cache.delete(oldestKey);
            } else {
              break;
            }
          }
          // Also clear the metadata cache completely under pressure
          this.metadataCache.clear();
          console.warn("[ImageMemory] Cleared metadata cache due to memory pressure.");

          // Try to trigger GC if available
          if (global.gc) {
            global.gc();
          }
        }
      } else if (this.memoryPressure && usage.rss < rssThreshold * 0.7) {
        // Hysteresis: Only clear pressure when well below threshold
        this.memoryPressure = false;
        console.log("[ImageMemory] Memory pressure resolved");
        this.emit("memory-pressure-end", {
          rss: usage.rss,
          heap: usage.heapUsed,
        });
      }

      // Emit regular metrics
      this.emit("metrics", this.getMetrics());
    }, 30000); // Check every 30 seconds

    // Don't prevent process from exiting
    if (typeof interval.unref === "function") {
      interval.unref();
    }

    return interval;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    clearInterval(this.memoryCheckInterval);
    this.clear();
    this.removeAllListeners();
  }
}

/**
 * Singleton instance of the ImageMemoryManager.
 */
export const ImageMemoryManagerInstance = new ImageMemoryManager();

/**
 * Destroy the singleton instance (mainly for testing).
 * Note: This will clear the instance's state but won't create a new one,
 * as it's a const. Tests needing a fresh instance should mock the module.
 */
export function destroyImageMemoryManager(): void {
  if (ImageMemoryManagerInstance) {
    ImageMemoryManagerInstance.destroy();
  }
}
