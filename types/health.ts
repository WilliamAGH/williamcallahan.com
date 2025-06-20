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
