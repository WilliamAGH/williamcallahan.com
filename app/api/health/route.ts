/**
 * Health Check Endpoint
 *
 * Lightweight health check endpoint that returns 200 OK immediately.
 * This endpoint has zero dependencies on modules that perform I/O operations
 * to ensure it can respond quickly during deployment and scaling events.
 *
 * Used by:
 * - Container orchestrators (Kubernetes, ECS, etc.) for liveness/readiness probes
 * - Load balancers for health checks
 * - Monitoring systems for uptime checks
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Returns a simple health check response with minimal information.
 * This endpoint is designed to be as fast as possible with no external dependencies.
 */
export function GET() {
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "williamcallahan.com",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    },
  );
}
