/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks cache.
 * This endpoint is rate-limited to prevent abuse.
 */
import "server-only";

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import type { DataFetchOperationSummary } from "@/types/lib";
import { API_ENDPOINT_STORE_NAME, DEFAULT_API_ENDPOINT_LIMIT_CONFIG, isOperationAllowed } from "@/lib/rate-limiter";
import { ServerCacheInstance } from "@/lib/server-cache";
import logger from "@/lib/utils/logger";
import { NextResponse } from "next/server";

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

// Rate limiting is now handled by the centralized lib/rate-limiter.ts

/**
 * POST handler - Refreshes the bookmarks cache
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorizationHeader = request.headers.get("Authorization");
  const cronRefreshSecret = process.env.BOOKMARK_CRON_REFRESH_SECRET;

  let isCronJob = false;

  // Check for custom secret authentication
  if (cronRefreshSecret && authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    const token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    if (token === cronRefreshSecret) {
      isCronJob = true;
      logger.info("[API Bookmarks Refresh] Authenticated as cron job via BOOKMARK_CRON_REFRESH_SECRET.");
    }
  }

  // Get client IP for rate limiting (only if not an authenticated cron job)
  if (!isCronJob) {
    const forwardedFor: string = request.headers.get("x-forwarded-for") || "unknown";
    const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown_ip"; // Ensure clientIp is never empty
    if (!isOperationAllowed(API_ENDPOINT_STORE_NAME, clientIp, DEFAULT_API_ENDPOINT_LIMIT_CONFIG)) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again later.",
        },
        { status: 429 },
      );
    }
  }

  try {
    // For cron jobs, always refresh. For others, check if refresh is needed.
    if (!isCronJob && !ServerCacheInstance.shouldRefreshBookmarks()) {
      const cached = ServerCacheInstance.getBookmarks();
      logger.info("[API Bookmarks Refresh] Regular request: Cache is already up to date.");
      return NextResponse.json({
        status: "success",
        message: "Bookmarks cache is already up to date",
        data: {
          refreshed: false,
          bookmarksCount: cached?.bookmarks.length || 0,
          lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
        },
      });
    }

    if (isCronJob) {
      logger.info("[API Bookmarks Refresh] Cron job: Forcing bookmark data refresh.");
    } else {
      logger.info(
        "[API Bookmarks Refresh] Regular request: Refreshing bookmarks data as cache is stale or needs update.",
      );
    }

    // Get current cached bookmarks to compare for new additions
    const previousBookmarks = await Promise.resolve(ServerCacheInstance.getBookmarks()?.bookmarks || []);
    const previousCount = previousBookmarks.length;
    const previousBookmarkIds = new Set(previousBookmarks.map((b) => b.id));

    logger.info(`[API Bookmarks Refresh] Previous cached bookmarks count: ${previousCount}`);

    // Use DataFetchManager for centralized data fetching
    const manager = new DataFetchManager();
    const results = await manager.fetchData({
      bookmarks: true,
      forceRefresh: true,
      immediate: true, // Process logos for new bookmarks immediately
    });

    const bookmarkResult: DataFetchOperationSummary | undefined = results.find((r) => r.operation === "bookmarks");
    const bookmarks =
      bookmarkResult?.success && (bookmarkResult.itemsProcessed ?? 0) > 0
        ? ServerCacheInstance.getBookmarks()?.bookmarks || []
        : null;

    // Logo processing is already handled by DataFetchManager when immediate: true
    const newBookmarksCount = bookmarks ? bookmarks.filter((b) => !previousBookmarkIds.has(b.id)).length : 0;

    return NextResponse.json({
      status: "success",
      message: `Bookmarks cache refreshed successfully${isCronJob ? " (triggered by cron job)" : ""}`,
      data: {
        refreshed: true,
        bookmarksCount: bookmarks?.length ?? 0,
        newBookmarksProcessed: newBookmarksCount,
      },
    });
  } catch (error) {
    logger.error("Failed to refresh bookmarks cache:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to refresh bookmarks cache",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * GET handler - Check if refresh is needed
 */
export async function GET(): Promise<NextResponse> {
  // Use Promise.resolve to satisfy require-await rule
  const cached = await Promise.resolve(ServerCacheInstance.getBookmarks());
  const needsRefresh = await Promise.resolve(ServerCacheInstance.shouldRefreshBookmarks());

  return NextResponse.json({
    status: "success",
    data: {
      needsRefresh,
      bookmarksCount: cached?.bookmarks.length || 0,
      lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      lastAttemptedAt: cached?.lastAttemptedAt ? new Date(cached.lastAttemptedAt).toISOString() : null,
    },
  });
}
