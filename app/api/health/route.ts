/**
 * Health Check API Route
 * @module app/api/health
 * @description
 * Server-side API endpoint for health checking.
 * Returns basic health information about the server.
 */

import { NextResponse } from "next/server";
import { ServerCacheInstance } from "../../../lib/server-cache";

// Make the endpoint dynamic to avoid caching
export const dynamic = "force-dynamic";

/**
 * GET handler for health checking
 * @returns {Promise<NextResponse>} API response with health status
 */
export async function GET(): Promise<NextResponse> {
  try {
    // Use Promise.resolve to satisfy require-await rule
    const cacheStats = await Promise.resolve(ServerCacheInstance.getStats());

    const healthData = {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || "0.0.0",
      container: process.env.RUNNING_IN_DOCKER === "true",
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      cacheStats,
    };

    return NextResponse.json(healthData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Health check failed:", error);

    return NextResponse.json(
      {
        status: "error",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        environment: process.env.NODE_ENV,
        container: process.env.RUNNING_IN_DOCKER === "true",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    );
  }
}
