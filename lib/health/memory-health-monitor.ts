/**
 * Memory Health Monitor
 *
 * Provides health checks and monitoring for memory usage.
 * Implements graceful degradation under memory pressure through:
 * - Multi-level status (healthy → warning → critical)
 * - Load balancer integration (503 when critical)
 * - Emergency cleanup with automatic cache clearing
 * - Memory trend analysis
 * - Integration with AsyncOperationsMonitor
 * - Coordination with ImageMemoryManager events
 *
 * @module lib/health/memory-health-monitor
 */

import { EventEmitter } from "node:events";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";
import { ServerCacheInstance } from "@/lib/server-cache";
import { asyncMonitor } from "@/lib/async-operations-monitor";
import { MEMORY_THRESHOLDS } from "@/lib/constants";
// import { type ImageMemoryMetrics } from "@/types/image";
import {
  type HealthCheckResult,
  type MemoryMetrics,
  // type SystemHealth,
  MiddlewareRequest,
  MiddlewareResponse,
  MiddlewareNextFunction,
} from "@/types/health";
// import { type CacheStats } from "@/types/cache";

/**
 * Monitor memory health and provide graceful degradation.
 *
 * Thresholds:
 * - Warning: 75% of IMAGE_RAM_BUDGET_BYTES
 * - Critical: 90% of IMAGE_RAM_BUDGET_BYTES
 *
 * Actions:
 * - Warning: Log and continue (stay in LB rotation)
 * - Critical: Return 503, trigger emergency cleanup
 *
 * @fires MemoryHealthMonitor#status-changed When health status changes
 * @fires MemoryHealthMonitor#emergency-cleanup-start/end During cleanup
 * @fires MemoryHealthMonitor#memory-trend-warning When trending up in warning
 * @fires MemoryHealthMonitor#metrics Regular memory metrics
 */
export class MemoryHealthMonitor extends EventEmitter {
  private status: "healthy" | "warning" | "critical" = "healthy";
  private readonly metricsHistory: MemoryMetrics[] = [];
  private readonly maxHistorySize = 100;
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Configurable thresholds
  private readonly warningThreshold: number;
  private readonly criticalThreshold: number;
  private readonly memoryBudget: number;

  constructor() {
    super();

    // Load thresholds from environment - use total process budget for health monitoring
    this.memoryBudget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
    this.warningThreshold = MEMORY_THRESHOLDS.MEMORY_WARNING_THRESHOLD;
    this.criticalThreshold = MEMORY_THRESHOLDS.MEMORY_CRITICAL_THRESHOLD;

    // Validate configuration
    this.validateConfiguration();

    // Subscribe to ImageMemoryManager events
    const imageManager = ImageMemoryManagerInstance;
    imageManager.on("memory-pressure-start", (data: Record<string, unknown>) => {
      console.warn("[MemoryHealth] Received memory pressure notification from ImageMemoryManager");
      this.handleMemoryPressure(data);
    });

    imageManager.on("memory-pressure-end", () => {
      console.log("[MemoryHealth] Memory pressure resolved in ImageMemoryManager");
    });

    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthCheckResult {
    const usage = process.memoryUsage();
    const imageManager = ImageMemoryManagerInstance;
    const imageMetrics = imageManager.getMetrics();
    const serverCacheStats = ServerCacheInstance.getStats();

    // Determine status based on RSS usage
    if (usage.rss > this.criticalThreshold) {
      this.status = "critical";
      return {
        status: "unhealthy",
        statusCode: 503,
        message: "Memory critical - instance should be removed from rotation",
        details: {
          ...usage,
          threshold: this.criticalThreshold,
          budget: this.memoryBudget,
          cacheStats: {
            imageCache: {
              size: imageMetrics.cacheSize,
              bytes: imageMetrics.cacheBytes,
            },
            serverCache: {
              keys: serverCacheStats.keys,
              hits: serverCacheStats.hits,
              misses: serverCacheStats.misses,
            },
          },
        },
      };
    }

    if (usage.rss > this.warningThreshold) {
      this.status = "warning";
      return {
        status: "degraded",
        statusCode: 200, // Still return 200 to stay in rotation
        message: "Memory warning - reduced capacity",
        details: {
          ...usage,
          threshold: this.warningThreshold,
          budget: this.memoryBudget,
          cacheStats: {
            imageCache: {
              size: imageMetrics.cacheSize,
              bytes: imageMetrics.cacheBytes,
            },
            serverCache: {
              keys: serverCacheStats.keys,
              hits: serverCacheStats.hits,
              misses: serverCacheStats.misses,
            },
          },
        },
      };
    }

    this.status = "healthy";
    return {
      status: "healthy",
      statusCode: 200,
      message: "Memory usage normal",
      details: {
        ...usage,
        budget: this.memoryBudget,
        cacheStats: {
          imageCache: {
            size: imageMetrics.cacheSize,
            bytes: imageMetrics.cacheBytes,
          },
          serverCache: {
            keys: serverCacheStats.keys,
            hits: serverCacheStats.hits,
            misses: serverCacheStats.misses,
          },
        },
      },
    };
  }

  /**
   * Check if new requests should be accepted
   */
  shouldAcceptNewRequests(): boolean {
    return this.status !== "critical";
  }

  /**
   * Check if image operations should be allowed
   */
  shouldAllowImageOperations(): boolean {
    return this.status === "healthy";
  }

  /**
   * Get memory usage trend
   */
  getMemoryTrend(): "stable" | "increasing" | "decreasing" {
    if (this.metricsHistory.length < 5) {
      return "stable";
    }

    // Compare average of last 5 readings with previous 5
    const recent = this.metricsHistory.slice(-5);
    const previous = this.metricsHistory.slice(-10, -5);

    const recentAvg = recent.reduce((sum, m) => sum + m.rss, 0) / recent.length;
    const previousAvg = previous.reduce((sum, m) => sum + m.rss, 0) / previous.length;

    const changePercent = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (changePercent > 10) return "increasing";
    if (changePercent < -10) return "decreasing";
    return "stable";
  }

  /**
   * Emergency garbage collection (if available)
   */
  async forceGarbageCollection(): Promise<void> {
    if (global.gc) {
      console.log("[MemoryHealth] Forcing garbage collection");
      global.gc();

      // Wait a bit for GC to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const afterGC = process.memoryUsage();
      console.log("[MemoryHealth] Post-GC memory:", {
        rss: Math.round(afterGC.rss / 1024 / 1024),
        heapUsed: Math.round(afterGC.heapUsed / 1024 / 1024),
        heapTotal: Math.round(afterGC.heapTotal / 1024 / 1024),
      });
    } else {
      console.warn("[MemoryHealth] GC not available (not started with --expose-gc)");
    }
  }

  /**
   * Emergency cleanup - aggressively free memory
   * Called when we hit critical memory thresholds
   */
  async emergencyCleanup(): Promise<void> {
    console.warn("[MemoryHealth] Starting emergency memory cleanup");
    this.emit("emergency-cleanup-start");

    const before = process.memoryUsage();

    try {
      // Clear server caches
      ServerCacheInstance.clearAllCaches();
      console.log("[MemoryHealth] Cleared server caches");

      // Clear image cache
      ImageMemoryManagerInstance.clear();
      console.log("[MemoryHealth] Cleared image memory manager");

      // Force garbage collection if available
      await this.forceGarbageCollection();

      const after = process.memoryUsage();
      const rssSaved = before.rss - after.rss;
      const heapSaved = before.heapUsed - after.heapUsed;

      console.log("[MemoryHealth] Emergency cleanup completed", {
        rssSavedMB: Math.round(rssSaved / 1024 / 1024),
        heapSavedMB: Math.round(heapSaved / 1024 / 1024),
      });

      this.emit("emergency-cleanup-end", { rssSaved, heapSaved });
    } catch (error) {
      console.error("[MemoryHealth] Error during emergency cleanup:", error);
      this.emit("emergency-cleanup-end", { error });
    }
  }

  /**
   * Handle memory pressure events from ImageMemoryManager
   */
  private handleMemoryPressure(data: Record<string, unknown>): void {
    console.warn("[MemoryHealth] Memory pressure detected", data);

    // If we're already at critical, trigger emergency cleanup
    if (this.status === "critical") {
      console.warn("[MemoryHealth] Critical memory pressure - starting emergency cleanup");
      // Don't await - let it run in background
      this.emergencyCleanup().catch((error) => {
        console.error("[MemoryHealth] Emergency cleanup failed:", error);
      });
    }
  }

  /**
   * Check current memory usage and update status
   */
  public checkMemory(): void {
    const usage = process.memoryUsage();
    const now = Date.now();
    const imageManager = ImageMemoryManagerInstance;
    const imageMetrics = imageManager.getMetrics();
    const serverCacheStats = ServerCacheInstance.getStats();

    // Create complete memory metrics including image cache data
    const memoryMetrics: MemoryMetrics = {
      timestamp: now,
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      imageCacheSize: imageMetrics.cacheSize,
      imageCacheBytes: imageMetrics.cacheBytes,
      serverCacheKeys: serverCacheStats.keys,
    };

    this.metricsHistory.push(memoryMetrics);

    // Trim history
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.splice(0, this.metricsHistory.length - this.maxHistorySize);
    }

    // Check thresholds and status
    const previousStatus = this.status;

    if (usage.rss > this.criticalThreshold) {
      this.status = "critical";
    } else if (usage.rss > this.warningThreshold) {
      this.status = "warning";
    } else {
      this.status = "healthy";
    }

    // Emit status change
    if (previousStatus !== this.status) {
      console.log(`[MemoryHealth] Status changed: ${previousStatus} → ${this.status}`);
      this.emit("status-changed", { from: previousStatus, to: this.status, metrics: memoryMetrics });
    }

    // Emit regular metrics
    this.emit("metrics", memoryMetrics);

    // Check for trend warnings
    if (this.status === "warning") {
      const trend = this.getMemoryTrend();
      if (trend === "increasing") {
        console.warn("[MemoryHealth] Memory trending upward in warning state");
        this.emit("memory-trend-warning", { trend, metrics: memoryMetrics });
      }
    }

    // Log async operations status
    const asyncStats = asyncMonitor.getHealthStatus();
    if (asyncStats.activeOperations > 0) {
      console.log(`[MemoryHealth] Active async operations: ${asyncStats.activeOperations}`);
    }
  }

  /**
   * Start periodic memory monitoring
   */
  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    const checkInterval = 5000; // 5 seconds - constant interval
    this.monitoringInterval = setInterval(() => {
      this.checkMemory();
    }, checkInterval);

    console.log("[MemoryHealth] Started monitoring with 5-second intervals");
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log("[MemoryHealth] Stopped monitoring");
    }
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(): MemoryMetrics[] {
    return [...this.metricsHistory];
  }

  /**
   * Get current status
   */
  getCurrentStatus(): "healthy" | "warning" | "critical" {
    return this.status;
  }

  /**
   * Validate configuration on startup
   */
  private validateConfiguration(): void {
    if (this.warningThreshold >= this.criticalThreshold) {
      throw new Error("[MemoryHealth] Warning threshold must be less than critical threshold");
    }

    if (this.memoryBudget <= 0) {
      throw new Error("[MemoryHealth] Memory budget must be positive");
    }

    const checkInterval = 5000; // 5 seconds fixed
    if (checkInterval < 1000) {
      throw new Error("[MemoryHealth] Check interval must be at least 1000ms");
    }

    console.log("[MemoryHealth] Configuration validated", {
      memoryBudgetMB: Math.round(this.memoryBudget / 1024 / 1024),
      warningThresholdMB: Math.round(this.warningThreshold / 1024 / 1024),
      criticalThresholdMB: Math.round(this.criticalThreshold / 1024 / 1024),
      checkIntervalMs: checkInterval,
    });
  }
}

// Singleton instance
let memoryHealthMonitorInstance: MemoryHealthMonitor | null = null;

/**
 * Get the singleton memory health monitor instance
 */
export function getMemoryHealthMonitor(): MemoryHealthMonitor {
  if (!memoryHealthMonitorInstance) {
    memoryHealthMonitorInstance = new MemoryHealthMonitor();
  }
  return memoryHealthMonitorInstance;
}

/**
 * Express/Next.js middleware for memory health checks
 */
export function memoryHealthCheckMiddleware(_req: MiddlewareRequest, res: MiddlewareResponse) {
  const monitor = getMemoryHealthMonitor();
  const health = monitor.getHealthStatus();

  // Note: setHeader may not be available on all response types
  if (typeof (res as unknown as { setHeader?: (name: string, value: string) => void }).setHeader === "function") {
    (res as unknown as { setHeader: (name: string, value: string) => void }).setHeader(
      "X-Memory-Status",
      health.status,
    );
  }
  return health;
}

/**
 * Express/Next.js middleware for memory pressure handling
 */
export function memoryPressureMiddleware(
  _req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: MiddlewareNextFunction,
) {
  const monitor = getMemoryHealthMonitor();

  if (!monitor.shouldAcceptNewRequests()) {
    res.status(503).json({
      error: "Service temporarily unavailable due to memory pressure",
      status: monitor.getCurrentStatus(),
    });
    return;
  }

  next();
}
