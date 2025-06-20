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

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns a detailed health check response, including memory status.
 * The status code reflects the system's health for load balancers.
 */
export function GET() {
  const monitor = getMemoryHealthMonitor();
  const health = monitor.getHealthStatus();

  const status = health.status === "unhealthy" ? 503 : 200;

  return NextResponse.json(health, {
    status,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
