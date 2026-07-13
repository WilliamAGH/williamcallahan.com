/**
 * Health Check Endpoint
 *
 * Simple health check for load balancers and uptime monitors.
 *
 * @module app/api/health
 */

import { NextResponse } from "next/server";
import { healthResponseSchema } from "@/types/schemas/api";

export function GET() {
  return NextResponse.json(
    healthResponseSchema.parse({ status: "healthy", timestamp: new Date().toISOString() }),
    { headers: { "Cache-Control": "no-cache, no-store, must-revalidate" } },
  );
}
