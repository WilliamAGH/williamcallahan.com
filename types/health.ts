import { z } from "zod";

export interface DeepCheckResult {
  name: string;
  status: "ok" | "error";
  details: string;
  duration: number;
}

export interface DeploymentReadinessCheckResult {
  name: string;
  category: string;
  passed: boolean;
  message: string;
  severity: "critical" | "warning" | "info";
  details?: string[];
}

// =============================================================================
// Health endpoint types and schema
// =============================================================================

export type MemoryStatus = "healthy" | "warning" | "critical";

export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  statusCode: number;
  message: string;
  // Details are intentionally broad to carry process metrics, thresholds, cache stats, etc.
  details: Record<string, unknown>;
}

export type MiddlewareRequest = Record<string, unknown>;

export interface MiddlewareResponse {
  status: (code: number) => MiddlewareResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
}

export type MiddlewareNextFunction = () => void;

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
}

// Broad, forward-compatible schema for health metrics API
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
  // System and allocator details may vary by environment; keep them flexible
  system: z.record(z.string(), z.unknown()),
  allocator: z.record(z.string(), z.unknown()),
});

export type HealthMetrics = z.infer<typeof HealthMetricsResponseSchema>;
