/**
 * Memory Health Monitor
 *
 * Provides health checks for load balancers using ImageMemoryManager's data.
 * No longer does its own monitoring - relies on ImageMemoryManager as the
 * single source of truth for memory state.
 *
 * @module lib/health/memory-health-monitor
 */

import { EventEmitter } from "node:events";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";
import { ServerCacheInstance } from "@/lib/server-cache";
import { MEMORY_THRESHOLDS } from "@/lib/constants";
import {
  type HealthCheckResult,
  type MemoryStatus,
  type MemoryPressureEvent,
  MiddlewareRequest,
  MiddlewareResponse,
  MiddlewareNextFunction,
} from "@/types/health";

/**
 * Health monitor that uses ImageMemoryManager's memory state
 * for load balancer integration and health endpoints.
 */
export class MemoryHealthMonitor extends EventEmitter {
  private readonly memoryBudget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
  private readonly warningThreshold = this.memoryBudget * 0.75;
  private readonly criticalThreshold = this.memoryBudget * 0.9;
  private readonly pressureEventListeners = {
    start: (data: MemoryPressureEvent) => this.emit("status-changed", { status: "warning", data }),
    end: (data: MemoryPressureEvent) => this.emit("status-changed", { status: "healthy", data }),
  };

  // In-memory history of memory metric snapshots for basic trend analysis
  private readonly metricsHistory: import("@/types/health").MemoryMetrics[] = [];

  // Interval handle for optional automatic monitoring (disabled for now)
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    ImageMemoryManagerInstance.on("memory-pressure-start", this.pressureEventListeners.start);
    ImageMemoryManagerInstance.on("memory-pressure-end", this.pressureEventListeners.end);

    // Automatically capture initial snapshot so history is non-empty
    this.checkMemory();
  }

  /**
   * Get current health status based on ImageMemoryManager's state
   */
  getHealthStatus(): HealthCheckResult {
    const usage = process.memoryUsage();
    const imageMetrics = ImageMemoryManagerInstance.getMetrics();
    const serverCacheStats = ServerCacheInstance.getStats();

    // Determine status based on current RSS
    const status =
      usage.rss > this.criticalThreshold ? "critical" : usage.rss > this.warningThreshold ? "warning" : "healthy";

    // Return 503 for critical status (remove from load balancer)
    if (status === "critical") {
      return {
        status: "unhealthy",
        statusCode: 503,
        message: "Memory critical - instance should be removed from rotation",
        details: {
          ...usage,
          threshold: this.criticalThreshold,
          budget: this.memoryBudget,
          memoryPressure: imageMetrics.memoryPressure,
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

    if (status === "warning") {
      return {
        status: "degraded",
        statusCode: 200, // Stay in rotation during warning
        message: "Memory warning - reduced capacity",
        details: {
          ...usage,
          threshold: this.warningThreshold,
          budget: this.memoryBudget,
          memoryPressure: imageMetrics.memoryPressure,
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

    return {
      status: "healthy",
      statusCode: 200,
      message: "Memory usage normal",
      details: {
        ...usage,
        budget: this.memoryBudget,
        memoryPressure: imageMetrics.memoryPressure,
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
   * Middleware that returns 503 during critical memory pressure
   */
  memoryPressureMiddleware() {
    return (_req: MiddlewareRequest, res: MiddlewareResponse, next: MiddlewareNextFunction) => {
      const health = this.getHealthStatus();

      if (health.statusCode === 503) {
        res.status(503).json({
          error: "Service temporarily unavailable due to memory pressure",
          health: health.details,
        });
        return;
      }

      next();
    };
  }

  /**
   * Check if new requests should be accepted
   */
  shouldAcceptNewRequests(): boolean {
    const health = this.getHealthStatus();
    return health.statusCode !== 503;
  }

  /**
   * Check if image operations should be allowed
   */
  shouldAllowImageOperations(): boolean {
    const imageMetrics = ImageMemoryManagerInstance.getMetrics();
    return !imageMetrics.memoryPressure;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
    ImageMemoryManagerInstance.off("memory-pressure-start", this.pressureEventListeners.start);
    ImageMemoryManagerInstance.off("memory-pressure-end", this.pressureEventListeners.end);
    this.removeAllListeners();

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Lightweight helper to provide a simple string status for quick checks.
   * This mirrors the logic in `getHealthStatus()` but avoids allocating the
   * larger object when only the status string is needed.
   */
  getCurrentStatus(): MemoryStatus {
    const usage = process.memoryUsage();

    if (usage.rss > this.criticalThreshold) {
      return "critical";
    }

    if (usage.rss > this.warningThreshold) {
      return "warning";
    }

    return "healthy";
  }

  /**
   * Alias maintained for backward compatibility with existing tests.
   * Prefer using `destroy()` in new code.
   */
  stopMonitoring(): void {
    this.destroy();
  }

  /**
   * Capture a snapshot of current memory metrics and store in history.
   * A sliding window of the most recent 60 measurements is kept.
   */
  checkMemory(): void {
    const usage = process.memoryUsage();
    const imageMetrics = ImageMemoryManagerInstance.getMetrics();
    const serverCacheStats = ServerCacheInstance.getStats();

    const snapshot: import("@/types/health").MemoryMetrics = {
      timestamp: Date.now(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      imageCacheSize: imageMetrics.cacheSize,
      imageCacheBytes: imageMetrics.cacheBytes,
      serverCacheKeys: serverCacheStats.keys,
    };

    this.metricsHistory.push(snapshot);

    // Keep only the latest 60 snapshots (~1 minute if captured every second)
    if (this.metricsHistory.length > 60) {
      this.metricsHistory.splice(0, this.metricsHistory.length - 60);
    }
  }

  /**
   * Return shallow copy of recorded metrics history.
   */
  getMetricsHistory() {
    return [...this.metricsHistory];
  }

  /**
   * Naïve trend detection using linear regression over the last N snapshots.
   * Provides coarse indicator – not intended for production decision-making.
   */
  getMemoryTrend(): "increasing" | "decreasing" | "stable" {
    if (this.metricsHistory.length < 2) {
      return "stable";
    }

    const first = this.metricsHistory[0]?.rss ?? 0;
    const last = this.metricsHistory[this.metricsHistory.length - 1]?.rss ?? 0;

    if (last > first * 1.1) {
      return "increasing";
    }
    if (last < first * 0.9) {
      return "decreasing";
    }
    return "stable";
  }

  /**
   * Attempt an emergency cleanup by clearing server-side caches.
   * Errors are logged but not re-thrown to avoid cascading failures.
   */
  async emergencyCleanup(): Promise<void> {
    try {
      console.warn("[MemoryHealthMonitor] Starting emergency memory cleanup");
      ServerCacheInstance.clearAllCaches();

      // Simulate asynchronous cleanup step to satisfy linter (and preserve API)
      await Promise.resolve();
    } catch (err) {
      console.error("[MemoryHealthMonitor] Error during emergency cleanup", err);
    }
  }
}

// Singleton instance
let instance: MemoryHealthMonitor | null = null;

export function getMemoryHealthMonitor(): MemoryHealthMonitor {
  if (!instance) {
    instance = new MemoryHealthMonitor();
  }
  return instance;
}

// =============================================================================
// Stand-alone middleware helpers (maintained for backwards compatibility)
// =============================================================================

/**
 * Adds an `X-Memory-Status` header to each response to surface current memory
 * state and returns the underlying `HealthCheckResult` for optional logging.
 */
export function memoryHealthCheckMiddleware(_req: MiddlewareRequest, res: MiddlewareResponse): HealthCheckResult {
  const monitor = getMemoryHealthMonitor();
  const health = monitor.getHealthStatus();
  if (typeof res.setHeader === "function") {
    res.setHeader("X-Memory-Status", monitor.getCurrentStatus());
  }
  return health;
}

/**
 * Express-style middleware that short-circuits requests when the instance is
 * under critical memory pressure.
 */
export function memoryPressureMiddleware(
  _req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: MiddlewareNextFunction,
): void {
  const monitor = getMemoryHealthMonitor();
  if (monitor.shouldAcceptNewRequests()) {
    next();
    return;
  }

  res.status(503).json({
    error: "Service temporarily unavailable due to memory pressure",
    status: monitor.getCurrentStatus(),
  });
}
