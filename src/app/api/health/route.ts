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

const SYSTEM_STATUS = {
  MEMORY_CRITICAL: "MEMORY_CRITICAL",
  MEMORY_WARNING: "MEMORY_WARNING",
  HEALTHY: "HEALTHY",
} as const;

/**
 * GET /api/health
 *
 * Returns a detailed health check response, including memory status.
 * The status code reflects the system's health for load balancers.
 */
export function GET() {
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
          {
            status: 503,
            headers: {
              "Cache-Control": "no-cache",
              "X-System-Status": SYSTEM_STATUS.MEMORY_CRITICAL,
            },
          },
        );
      }
    }

    const monitor = getMemoryHealthMonitor();
    const health = monitor.getHealthStatus();
    const status = health.status === "unhealthy" ? 503 : 200;

    // Map health to X-System-Status for lightweight HEAD checks
    const systemStatus: (typeof SYSTEM_STATUS)[keyof typeof SYSTEM_STATUS] =
      health.status === "unhealthy"
        ? SYSTEM_STATUS.MEMORY_CRITICAL
        : health.status === "degraded"
          ? SYSTEM_STATUS.MEMORY_WARNING
          : SYSTEM_STATUS.HEALTHY;

    return NextResponse.json(health, {
      status,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-System-Status": systemStatus,
      },
    });
  } catch (error) {
    // Timeout or other error. We intentionally default to MEMORY_CRITICAL to follow a fail-safe policy:
    // if health cannot be confirmed, downstream systems must assume the host is unhealthy and shed load.
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Health check failed",
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-cache",
          "X-System-Status": SYSTEM_STATUS.MEMORY_CRITICAL,
        },
      },
    );
  }
}
