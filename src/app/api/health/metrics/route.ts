/**
 * Health Metrics Endpoint
 *
 * Provides basic runtime and system metrics about the application.
 *
 * @module app/api/health/metrics
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  preventCaching,
  validateAuthSecret,
  createErrorResponse,
  NO_STORE_HEADERS,
} from "@/lib/utils/api-utils";
import { getSystemMetrics } from "@/lib/health/status-monitor.server";

const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isProductionBuild) {
    return NextResponse.json(
      { status: "skipped", timestamp: new Date().toISOString() },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
  preventCaching();
  const expectedToken =
    process.env.GITHUB_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
  if (!validateAuthSecret(request, expectedToken)) {
    return createErrorResponse("Unauthorized", 401);
  }
  const systemMetrics = await getSystemMetrics();
  return NextResponse.json(
    {
      status: "healthy",
      timestamp: new Date().toISOString(),
      system: systemMetrics,
    },
    { headers: NO_STORE_HEADERS },
  );
}
