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
export function GET(): NextResponse {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "This endpoint is only available in development mode." }, { status: 403 });
  }

  try {
    const monitor = getMemoryHealthMonitor();
    const serverCacheStats = monitor.getHealthStatus().details.cacheStats?.serverCache;

    const response = {
      serverCache: serverCacheStats,
      // Add other metrics as needed
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error retrieving health metrics:", error);
    return NextResponse.json(
      { error: "Failed to retrieve health metrics" },
      { status: 500 }
    );
  }
}
