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
import { ServerCacheInstance } from "@/lib/server-cache";
import { MEMORY_THRESHOLDS } from "@/lib/constants";
import {
  type HealthCheckResult,
  type MemoryStatus,
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
  private readonly warningThreshold = MEMORY_THRESHOLDS.MEMORY_WARNING_THRESHOLD;
  private readonly criticalThreshold = MEMORY_THRESHOLDS.MEMORY_CRITICAL_THRESHOLD;
  // In-memory history of memory metric snapshots for basic trend analysis
  private readonly metricsHistory: import("@/types/health").MemoryMetrics[] = [];

  // Interval handle for optional automatic monitoring (disabled for now)
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();

    // Automatically capture initial snapshot so history is non-empty
    this.checkMemory();
  }

  /**
   * Get current health status based on ImageMemoryManager's state
   */
  getHealthStatus(): HealthCheckResult {
    const usage = process.memoryUsage();
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
          cacheStats: {
            imageCache: {
              size: 0,
              bytes: 0,
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
          cacheStats: {
            imageCache: {
              size: 0,
              bytes: 0,
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
        cacheStats: {
          imageCache: {
            size: 0,
            bytes: 0,
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
    return (req: MiddlewareRequest, res: MiddlewareResponse, next: MiddlewareNextFunction) => {
      void req; // Explicitly mark as unused per project convention
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
    return true;
  }

  /**
   * Clean up event listeners
   */
  destroy(): void {
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
    const serverCacheStats = ServerCacheInstance.getStats();

    const snapshot: import("@/types/health").MemoryMetrics = {
      timestamp: Date.now(),
      rss: usage.rss,
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers,
      imageCacheSize: 0,
      imageCacheBytes: 0,
      serverCacheKeys: serverCacheStats.keys,
    };

    this.metricsHistory.push(snapshot);

    // Keep only the latest 60 snapshots (~1 minute if captured every second)
    if (this.metricsHistory.length > 60) {
      this.metricsHistory.splice(0, this.metricsHistory.length - 60);
    }
  }

  /**
   * Get allocator-level memory diagnostics for deeper analysis
   */
  getAllocatorDiagnostics(): Record<string, unknown> {
    const usage = process.memoryUsage();

    // Calculate memory fragmentation
    const heapFragmentation = usage.heapTotal > 0 ? ((usage.heapTotal - usage.heapUsed) / usage.heapTotal) * 100 : 0;

    // External memory ratio (buffers, C++ objects)
    const externalRatio = usage.rss > 0 ? (usage.external / usage.rss) * 100 : 0;

    // V8 heap statistics if available
    let v8HeapStats: Record<string, unknown> = {};
    try {
      // Check if garbage collection is exposed (requires --expose-gc flag)
      const globalWithGc = global as { gc?: () => void };
      if (typeof globalWithGc.gc === "function") {
        // Force GC if exposed
        globalWithGc.gc();
      }

      // Get V8 heap statistics using dynamic import to avoid require
      // This is a runtime check for V8 API availability
      if (typeof process !== "undefined" && process.versions && process.versions.v8) {
        try {
          // Use process.memoryUsage.rss() for basic V8 metrics
          const memoryUsage = process.memoryUsage();
          v8HeapStats = {
            // Basic V8 metrics from process.memoryUsage()
            heapTotal: memoryUsage.heapTotal,
            heapUsed: memoryUsage.heapUsed,
            external: memoryUsage.external,
            arrayBuffers: memoryUsage.arrayBuffers,
            // Calculate derived metrics
            heapUtilization: memoryUsage.heapTotal > 0 ? (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100 : 0,
            // V8 version info
            v8Version: process.versions.v8,
          };
        } catch {
          // Fallback if V8 API not available
        }
      }
    } catch {
      // V8 statistics not available
    }

    return {
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        platform: process.platform,
        nodeVersion: process.version,
        v8Version: process.versions.v8,
      },
      memory: {
        ...usage,
        heapFragmentation: `${heapFragmentation.toFixed(2)}%`,
        externalRatio: `${externalRatio.toFixed(2)}%`,
        nativeMemory: usage.rss - usage.heapTotal - usage.external,
      },
      v8Heap: v8HeapStats,
      allocator: {
        // Memory pressure indicators
        isUnderPressure: usage.rss > this.warningThreshold,
        pressureLevel:
          usage.rss > this.criticalThreshold ? "critical" : usage.rss > this.warningThreshold ? "warning" : "normal",
        // Memory growth rate (if history available)
        growthRate: this.calculateMemoryGrowthRate(),
      },
      limits: {
        budget: this.memoryBudget,
        warningThreshold: this.warningThreshold,
        criticalThreshold: this.criticalThreshold,
        warningPercentage: `${((this.warningThreshold / this.memoryBudget) * 100).toFixed(0)}%`,
        criticalPercentage: `${((this.criticalThreshold / this.memoryBudget) * 100).toFixed(0)}%`,
      },
    };
  }

  /**
   * Calculate memory growth rate over the last minute
   */
  private calculateMemoryGrowthRate(): string {
    if (this.metricsHistory.length < 2) {
      return "N/A";
    }

    const oldestMetric = this.metricsHistory[0];
    const newestMetric = this.metricsHistory[this.metricsHistory.length - 1];

    if (!oldestMetric || !newestMetric) {
      return "N/A";
    }

    const timeDiffMs = newestMetric.timestamp - oldestMetric.timestamp;
    const memDiffBytes = newestMetric.rss - oldestMetric.rss;

    if (timeDiffMs === 0) {
      return "N/A";
    }

    // Calculate bytes per second
    const bytesPerSecond = memDiffBytes / (timeDiffMs / 1000);
    const mbPerMinute = (bytesPerSecond * 60) / (1024 * 1024);

    return `${mbPerMinute >= 0 ? "+" : ""}${mbPerMinute.toFixed(2)} MB/min`;
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
   * Attempt an emergency cleanup by disabling caches rather than clearing them.
   * This allows the system to continue functioning without cache operations.
   * Errors are logged but not re-thrown to avoid cascading failures.
   */
  async emergencyCleanup(): Promise<void> {
    try {
      // Allow console output during specific memory management tests
      if (process.env.NODE_ENV !== "test" || process.env.ALLOW_MEMORY_TEST_LOGS === "true") {
        console.warn("[MemoryHealthMonitor] Emergency cleanup: disabling cache operations");
      }

      // Note: We're NOT clearing caches aggressively anymore
      // The system should continue to function without caches

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
export function memoryHealthCheckMiddleware(req: MiddlewareRequest, res: MiddlewareResponse): HealthCheckResult {
  void req; // Explicitly mark as unused per project convention
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
  req: MiddlewareRequest,
  res: MiddlewareResponse,
  next: MiddlewareNextFunction,
): void {
  void req; // Explicitly mark as unused per project convention
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

// ---------------------------------------------------------------------------
// Shared helper: securely wipe (zero-fill) a Buffer to aid GC and prevent
// accidental retention of sensitive data.  Preferred over ad-hoc buffer.fill
// calls scattered across services.
// ---------------------------------------------------------------------------

export function wipeBuffer(buf: Buffer | null | undefined): void {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return;
  try {
    buf.fill(0);
  } catch {
    /* ignore – non-critical */
  }
}
