/**
 * Health Metrics Endpoint
 *
 * Provides detailed metrics about the application's health, including
 * cache statistics and memory usage.
 *
 * @module app/api/health/metrics
 */

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { unstable_noStore as noStore } from "next/cache";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { getSystemMetrics } from "@/lib/health/status-monitor.server";
import { HealthMetricsResponseSchema, type HealthMetrics } from "@/types/health";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

/**
 * GET /api/health/metrics
 * @description Returns detailed health and performance metrics for the application.
 * @returns {NextResponse}
 */
export async function GET(): Promise<NextResponse> {
  noStore();
  try {
    // Check authorization using existing env variable
    const authHeader = (await headers()).get("authorization");
    const expectedToken = process.env.GITHUB_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
    }
    const monitor = getMemoryHealthMonitor();
    const healthStatus = monitor.getHealthStatus();
    const systemMetrics = await getSystemMetrics();

    // Get process memory usage
    const memUsage = process.memoryUsage();

    // Import ServerCache for detailed stats
    const { ServerCacheInstance } = await import("@/lib/server-cache");

    const serverCacheStats = ServerCacheInstance.getStats();

    // Get allocator diagnostics for deeper analysis
    const allocatorDiagnostics = monitor.getAllocatorDiagnostics();

    // Safely access budget and threshold with optional chaining
    const rawBudget = typeof healthStatus.details?.budget === "number" ? healthStatus.details.budget : null;
    const rawThreshold = typeof healthStatus.details?.threshold === "number" ? healthStatus.details.threshold : null;
    const budget = rawBudget ?? 0;
    const threshold = rawThreshold ?? 0;

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
          totalBudget: Math.round(budget / 1024 / 1024), // MB
          warningThreshold: Math.round(threshold / 1024 / 1024), // MB
          criticalThreshold: Math.round((budget * 0.9) / 1024 / 1024), // MB
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
          cacheSize: 0,
          cacheBytes: 0,
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          memoryPressure: false,
        },
      },
      health: {
        status: healthStatus.status,
        message: healthStatus.message,
      },
      system: systemMetrics,
      allocator: allocatorDiagnostics,
    };

    // Validate the final response against the Zod schema to ensure type safety
    const parsedResponse = HealthMetricsResponseSchema.parse(response);

    return NextResponse.json(parsedResponse, { headers: NO_STORE_HEADERS });
  } catch (error: unknown) {
    console.error("Error retrieving health metrics:", error);
    const message =
      error instanceof Error ? error.message : "An unknown error occurred while retrieving health metrics.";
    return NextResponse.json(
      { error: "Failed to retrieve health metrics", details: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
