/**
 * Cache Invalidation Endpoint for GitHub Activity
 *
 * Called by the scheduler after successful GitHub activity refresh
 * to ensure fresh data is served to users.
 *
 * @module api/revalidate/github-activity
 */

import { envLogger } from "@/lib/utils/env-logger";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { invalidateAllGitHubCaches } from "@/lib/cache/invalidation";

/**
 * POST - Invalidate GitHub activity caches
 *
 * Requires Bearer token authentication using GITHUB_CRON_REFRESH_SECRET
 * or BOOKMARK_CRON_REFRESH_SECRET (fallback for shared secret environments).
 *
 * @param request - Incoming Next.js request
 * @returns JSON response indicating success or failure
 */
export function POST(request: NextRequest): NextResponse {
  console.log(
    `[Cache Invalidation] GitHub activity revalidation endpoint called at ${new Date().toISOString()}`,
  );

  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const expectedToken =
    process.env.GITHUB_CRON_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;

  if (!expectedToken) {
    console.error("[Cache Invalidation] GITHUB_CRON_REFRESH_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Parse Bearer token robustly (case-insensitive scheme, tolerant to whitespace)
  const presentedToken = (() => {
    const h = authHeader ?? "";
    const match = h.match(/^\s*Bearer\s+(.+?)\s*$/i);
    return match?.[1]?.trim() ?? "";
  })();

  if (presentedToken !== expectedToken) {
    envLogger.log("Unauthorized GitHub revalidation attempt", undefined, {
      category: "CacheInvalidation",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cache Invalidation] Revalidating GitHub activity caches...");

    // Use centralized cache invalidation
    invalidateAllGitHubCaches();

    // Revalidate the projects page which displays GitHub activity
    revalidatePath("/projects");

    console.log("[Cache Invalidation] ✅ Successfully invalidated all GitHub activity caches");

    return NextResponse.json(
      {
        success: true,
        message: "GitHub activity cache invalidated successfully",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Cache Invalidation] Error during GitHub revalidation:", errorMessage);
    return NextResponse.json(
      {
        error: "Cache invalidation failed",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}

/**
 * GET - Health check endpoint
 *
 * Returns endpoint status and authentication requirements.
 */
export function GET(): NextResponse {
  return NextResponse.json(
    {
      status: "ready",
      endpoint: "/api/revalidate/github-activity",
      method: "POST",
      authentication: "Bearer token required (GITHUB_CRON_REFRESH_SECRET)",
    },
    { status: 200 },
  );
}
