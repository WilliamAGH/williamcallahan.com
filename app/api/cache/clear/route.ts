/**
 * Cache Clear API Route
 * @module app/api/cache/clear
 * @description
 * Server-side API endpoint for clearing server caches.
 * This is useful for development and testing.
 */

import { NextResponse } from "next/server";
import { ServerCacheInstance } from "../../../../lib/server-cache";
import type { CacheStats } from "@/types/cache";

/**
 * POST handler for cache clearing
 * @param {Request} req - Incoming request
 * @returns {NextResponse} API response
 */
export function POST(req: Request): NextResponse {
  if (req.method !== "POST") {
    return NextResponse.json({ message: "Method Not Allowed" }, { status: 405 });
  }

  // Optional: Add authentication here to protect the endpoint
  // For example, check for a secret token in the request headers or body

  ServerCacheInstance.clearAllCaches();

  return NextResponse.json({
    message: "All caches cleared successfully.",
    caches: ["ServerCache", "ImageMemoryManager"],
  });
}

/**
 * GET handler for cache stats
 * @returns {NextResponse} API response
 */
export function GET(): NextResponse {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({
      error: "This endpoint is only available in development mode.",
    });
  }

  try {
    const beforeStats: CacheStats = ServerCacheInstance.getStats();
    ServerCacheInstance.clearAllCaches();
    const afterStats: CacheStats = ServerCacheInstance.getStats();

    return NextResponse.json({
      message: "All server-side caches have been cleared.",
      before: beforeStats,
      after: afterStats,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      {
        error: "Failed to clear caches.",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
