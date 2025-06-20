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
    
    // Get process memory usage
    const memUsage = process.memoryUsage();
    
    // Import ServerCache and ImageMemoryManager for detailed stats
    const { ServerCacheInstance } = await import("@/lib/server-cache");
    const { ImageMemoryManagerInstance } = await import("@/lib/image-memory-manager");
    
    const serverCacheStats = ServerCacheInstance.getStats();
    const imageMemoryStats = ImageMemoryManagerInstance.getMetrics();

    const response = {
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
          totalBudget: Math.round(healthStatus.details.budget! / 1024 / 1024), // MB
          warningThreshold: Math.round(healthStatus.details.threshold! / 1024 / 1024), // MB
          criticalThreshold: Math.round((healthStatus.details.budget! * 0.9) / 1024 / 1024), // MB
        },
      },
      caches: {
        serverCache: {
          ...serverCacheStats,
          sizeBytes: serverCacheStats.sizeBytes || 0,
          maxSizeBytes: serverCacheStats.maxSizeBytes || 0,
          utilizationPercent: serverCacheStats.utilizationPercent || 0,
        },
        imageMemory: {
          cacheSize: imageMemoryStats.cacheSize,
          cacheBytes: Math.round(imageMemoryStats.cacheBytes / 1024 / 1024), // MB
          memoryPressure: imageMemoryStats.memoryPressure,
        },
      },
      health: {
        status: healthStatus.status,
        message: healthStatus.message,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving health metrics:", error);
    return NextResponse.json({ error: "Failed to retrieve health metrics" }, { status: 500 });
  }
}
