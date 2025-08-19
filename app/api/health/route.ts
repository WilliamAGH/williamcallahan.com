/**
 * Health Check Endpoint
 *
 * Provides a simple health check for load balancers and uptime monitors.
 * Returns a 200 OK response if the service is running.
 *
 * For detailed metrics, see /api/health/metrics.
 *
 * @module app/api/health
 */

import { NextResponse } from "next/server";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { MEMORY_THRESHOLDS } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns a detailed health check response, including memory status.
 * The status code reflects the system's health for load balancers.
 */
export async function GET() {
  try {
    // Check memory first (quick check)
    const memoryUsage = process.memoryUsage();

    // Skip strict memory check in non-production environments to avoid
    // interrupting local development with 503 responses.
    if (process.env.NODE_ENV === "production") {
      const totalBudget = MEMORY_THRESHOLDS.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
      const criticalThreshold = totalBudget * 0.95;

      if (memoryUsage.rss > criticalThreshold) {
        return NextResponse.json(
          {
            status: "unhealthy",
            memory: {
              rss: memoryUsage.rss,
              critical: true,
              message: "Memory critically high - restart recommended",
            },
          },
          { status: 503, headers: { "Cache-Control": "no-cache" } },
        );
      }
    }

    // Create timeout with proper cleanup
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Health check timeout"));
      }, 5000);
    });

    try {
      // Regular health check with timeout
      const monitor = await Promise.race([getMemoryHealthMonitor(), timeoutPromise]);

      // Clear timeout if monitor resolves first
      if (timeoutId) clearTimeout(timeoutId);

      const health = monitor.getHealthStatus();
      const status = health.status === "unhealthy" ? 503 : 200;

      return NextResponse.json(health, {
        status,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    } catch (error: unknown) {
      // Clear timeout on error
      if (timeoutId) clearTimeout(timeoutId);
      throw error;
    }
  } catch (error) {
    // Timeout or other error
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Health check failed",
      },
      { status: 503, headers: { "Cache-Control": "no-cache" } },
    );
  }
}
