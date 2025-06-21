/**
 * Health Metrics Endpoint
 *
 * Provides detailed metrics about the application's health, including
 * cache statistics and memory usage.
 *
 * @module app/api/health/metrics
 */

import { NextResponse } from "next/server";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { getSystemMetrics } from "@/lib/health/status-monitor.server";
import { HealthMetricsResponseSchema } from "@/types/health";
import { type HealthMetrics } from "@/types/health";

export const dynamic = "force-dynamic";

/**
 * GET /api/health/metrics
 * @description Returns detailed health and performance metrics for the application.
 * @returns {NextResponse}
 */
export async function GET(): Promise<NextResponse> {
  try {
    const monitor = getMemoryHealthMonitor();
    const healthStatus = monitor.getHealthStatus();
    const systemMetrics = await getSystemMetrics();

    // Get process memory usage
    const memUsage = process.memoryUsage();

    // Import ServerCache and ImageMemoryManager for detailed stats
    const { ServerCacheInstance } = await import("@/lib/server-cache");
    const { ImageMemoryManagerInstance } = await import("@/lib/image-memory-manager");

    const serverCacheStats = ServerCacheInstance.getStats();
    const imageMemoryStats = ImageMemoryManagerInstance.getMetrics();

    const response: HealthMetrics = {
      status: healthStatus.status,
      timestamp: new Date().toISOString(),
      memory: {
        process: {
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
        },
        limits: {
          totalBudget: Math.round((healthStatus.details.budget || 0) / 1024 / 1024), // MB
          warningThreshold: Math.round((healthStatus.details.threshold || 0) / 1024 / 1024), // MB
          criticalThreshold: Math.round(((healthStatus.details.budget || 0) * 0.9) / 1024 / 1024), // MB
        },
      },
      caches: {
        serverCache: {
          keys: Number(serverCacheStats.keys ?? 0),
          hits: Number(serverCacheStats.hits ?? 0),
          misses: Number(serverCacheStats.misses ?? 0),
          sizeBytes: serverCacheStats.sizeBytes || 0,
          maxSizeBytes: serverCacheStats.maxSizeBytes || 0,
          utilizationPercent: serverCacheStats.utilizationPercent || 0,
        },
        imageMemory: {
          cacheSize: imageMemoryStats.cacheSize,
          cacheBytes: Math.round(imageMemoryStats.cacheBytes / 1024 / 1024), // MB
          rss: imageMemoryStats.rss,
          heapUsed: imageMemoryStats.heapUsed,
          external: imageMemoryStats.external,
          memoryPressure: imageMemoryStats.memoryPressure,
        },
      },
      health: {
        status: healthStatus.status,
        message: healthStatus.message,
      },
      system: systemMetrics,
    };

    // Validate the final response against the Zod schema to ensure type safety
    const parsedResponse = HealthMetricsResponseSchema.parse(response);

    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error("Error retrieving health metrics:", error);
    return NextResponse.json({ error: "Failed to retrieve health metrics" }, { status: 500 });
  }
}
