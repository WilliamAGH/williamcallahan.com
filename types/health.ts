/**
 * Health Check and Memory Monitoring Types
 */

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  statusCode: number;
  message: string;
  details: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    threshold?: number;
    budget?: number;
    memoryPressure?: boolean;
    cacheStats?: {
      imageCache: {
        size: number;
        bytes: number;
      };
      serverCache: {
        keys: number;
        hits: number;
        misses: number;
      };
    };
  };
}

export interface MemoryMetrics {
  timestamp: number;
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
  imageCacheSize: number;
  imageCacheBytes: number;
  serverCacheKeys: number;
  asyncOperations?: {
    pending: number;
    total: number;
  };
  /** Whether the system is currently under memory pressure */
  memoryPressure?: boolean;
}

/**
 * Basic middleware types for health check endpoints
 * These avoid the need for Express dependency
 */
export interface MiddlewareRequest {
  [key: string]: unknown;
}

export interface MiddlewareResponse {
  status(code: number): MiddlewareResponse;
  json(data: unknown): void;
  setHeader?(name: string, value: string): void;
}

export type MiddlewareNextFunction = () => void;

/** Memory thresholds configuration for monitoring and load shedding */
export interface MemoryThresholds {
  /** Critical memory threshold - triggers 503 responses (in bytes) */
  MEMORY_CRITICAL_THRESHOLD: number;
  /** Warning memory threshold - adds warning headers (in bytes) */
  MEMORY_WARNING_THRESHOLD: number;
  /** Total RAM budget for image caching (in bytes) */
  IMAGE_RAM_BUDGET_BYTES: number;
  /** Threshold for streaming large images to S3 (in bytes) */
  IMAGE_STREAM_THRESHOLD_BYTES: number;
}

/** Memory monitoring interface for runtime-specific implementations */
export interface MemoryChecker {
  isMemoryCritical(): Promise<boolean>;
  isMemoryWarning(): Promise<boolean>;
}

export type MemoryStatus = "healthy" | "warning" | "critical";

/** Event payload emitted by ImageMemoryManager when memory pressure starts or ends */
export interface MemoryPressureEvent {
  rss: number;
  heap: number;
  /** Percentage of total process memory used (0-100) if available */
  memoryUsagePercent?: number;
  /** Threshold in bytes that triggered the pressure event, if provided */
  threshold?: number;
  /** Source that triggered the event (e.g., "external", "internal") */
  source?: string;
  /** Optional size of the image cache when event fired */
  cacheSize?: number;
}

import { z } from "zod";

/**
 * Zod schema for system memory information from systeminformation library
 * Validates memory metrics including total, free, used, and swap memory
 */
const SystemInfoMemSchema = z.object({
  total: z.number(),
  free: z.number(),
  used: z.number(),
  active: z.number(),
  available: z.number(),
  buffcache: z.number(),
  swaptotal: z.number(),
  swapused: z.number(),
  swapfree: z.number(),
});

/**
 * Zod schema for system CPU information from systeminformation library
 * Validates CPU load metrics including average load, current load, and per-CPU statistics
 */
const SystemInfoCpuSchema = z.object({
  avgLoad: z.number(),
  currentLoad: z.number(),
  cpus: z.array(
    z.object({
      load: z.number(),
      loadUser: z.number(),
      loadNice: z.number(),
      loadSystem: z.number(),
      loadIrq: z.number(),
      rawLoad: z.number(),
      rawLoadUser: z.number(),
      rawLoadNice: z.number(),
      rawLoadSystem: z.number(),
      rawLoadIrq: z.number(),
    }),
  ),
});

/**
 * Zod schema for network interface statistics from systeminformation library
 * Validates network metrics including interface name, operational state, and byte counters
 */
const SystemInfoNetSchema = z.array(
  z.object({
    iface: z.string(),
    operstate: z.string(),
    rx_bytes: z.number(),
    tx_bytes: z.number(),
  }),
);

/**
 * Zod schema for consolidated system metrics
 * Combines memory, CPU, network, and timestamp information
 */
export const SystemMetricsSchema = z.object({
  mem: SystemInfoMemSchema,
  cpu: SystemInfoCpuSchema,
  net: SystemInfoNetSchema,
  ts: z.number(),
});

/**
 * Zod schema for the complete health metrics API response
 * Validates the entire structure returned by the /api/health/metrics endpoint
 */
export const HealthMetricsResponseSchema = z.object({
  status: z.string(),
  timestamp: z.string(),
  memory: z.object({
    process: z.object({
      rss: z.number(),
      heapTotal: z.number(),
      heapUsed: z.number(),
      external: z.number(),
    }),
    limits: z.object({
      totalBudget: z.number(),
      warningThreshold: z.number(),
      criticalThreshold: z.number(),
    }),
  }),
  caches: z.object({
    serverCache: z.object({
      keys: z.number(),
      hits: z.number(),
      misses: z.number(),
      ksize: z.number().optional(),
      vsize: z.number().optional(),
      sizeBytes: z.number(),
      maxSizeBytes: z.number(),
      utilizationPercent: z.number(),
    }),
    imageMemory: z.object({
      cacheSize: z.number(),
      cacheBytes: z.number(),
      rss: z.number(),
      heapUsed: z.number(),
      external: z.number(),
      memoryPressure: z.boolean(),
    }),
  }),
  health: z.object({
    status: z.string(),
    message: z.string(),
  }),
  system: SystemMetricsSchema.or(z.object({ error: z.string(), details: z.string() })),
});

/** TypeScript type inferred from HealthMetricsResponseSchema for type-safe health metrics */
export type HealthMetrics = z.infer<typeof HealthMetricsResponseSchema>;
