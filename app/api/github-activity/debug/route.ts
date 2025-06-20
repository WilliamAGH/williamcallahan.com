/**
 * Debug endpoint for GitHub activity data
 *
 * This endpoint provides diagnostic information about the GitHub activity system
 * without triggering any data refreshes or modifications.
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { NextResponse } from "next/server";
import type { CacheStats } from "@/types/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/github-activity/debug
 * @description In development, returns the current cached GitHub activity data and stats.
 * @returns {NextResponse}
 */
export function GET(): NextResponse {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "This endpoint is only available in development mode." }, { status: 403 });
  }

  const activity = ServerCacheInstance.getGithubActivity();
  const stats: CacheStats = ServerCacheInstance.getStats();
  const shouldRefresh = ServerCacheInstance.shouldRefreshGithubActivity();

  return NextResponse.json({
    message: "GitHub activity cache debug info.",
    cache: {
      hasData: !!activity,
      isStale: shouldRefresh,
      data: activity,
      stats: stats,
    },
  });
}
