/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks.
 * This endpoint is rate-limited to prevent abuse.
 */
import "server-only";

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { API_ENDPOINT_STORE_NAME, DEFAULT_API_ENDPOINT_LIMIT_CONFIG, isOperationAllowed } from "@/lib/rate-limiter";
import { ServerCacheInstance } from "@/lib/server-cache";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import logger from "@/lib/utils/logger";
import { NextResponse } from "next/server";
import type { BookmarksIndex } from "@/types/bookmark";

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

/**
 * POST handler - Refreshes the bookmarks
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
      // Read current count from S3 index
      const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

      logger.info("[API Bookmarks Refresh] Regular request: Bookmarks are already up to date.");
      return NextResponse.json({
        status: "success",
        message: "Bookmarks are already up to date",
        data: {
          refreshed: false,
          bookmarksCount: index?.count || 0,
          lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        },
      });
    }

    if (isCronJob) {
      logger.info("[API Bookmarks Refresh] Cron job: Forcing bookmark data refresh.");
    } else {
      logger.info(
        "[API Bookmarks Refresh] Regular request: Refreshing bookmarks data as they are stale or need update.",
      );
    }

    // Get previous count from S3 index
    let previousCount = 0;
    try {
      const previousIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
      previousCount = previousIndex?.count || 0;
    } catch {
      // Index doesn't exist yet
    }

    logger.info(`[API Bookmarks Refresh] Previous bookmarks count: ${previousCount}`);

    // Use DataFetchManager for centralized data fetching
    const manager = new DataFetchManager();
    
    // Start refresh in background (non-blocking)
    const refreshPromise = manager.fetchData({
      bookmarks: true,
      forceRefresh: true,
      immediate: false, // Don't process logos immediately to reduce memory pressure
    });
    
    // Handle errors in background without blocking response
    refreshPromise
      .then((results) => {
        const bookmarkResult = results.find((r) => r.operation === "bookmarks");
        if (bookmarkResult?.success) {
          logger.info(`[API Bookmarks Refresh] Background refresh completed successfully`);
        } else {
          logger.error(`[API Bookmarks Refresh] Background refresh failed:`, bookmarkResult?.error);
        }
      })
      .catch((error) => {
        logger.error(`[API Bookmarks Refresh] Background refresh error:`, error);
        // Check if memory related
        if ((error as Error).message?.includes('memory')) {
          logger.error(`[API Bookmarks Refresh] Memory exhaustion detected. Container restart may be needed.`);
        }
      });
    
    // Return immediately without waiting
    logger.info(`[API Bookmarks Refresh] Started background refresh process`);
    
    return NextResponse.json({
      status: "success",
      message: `Bookmark refresh started in background${isCronJob ? " (triggered by cron job)" : ""}`,
      data: {
        refreshStarted: true,
        previousCount,
      },
    });
  } catch (error) {
    logger.error("Failed to refresh bookmarks:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to refresh bookmarks",
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
  try {
    // Read from S3 index
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    const needsRefresh = ServerCacheInstance.shouldRefreshBookmarks();

    return NextResponse.json({
      status: "success",
      data: {
        needsRefresh,
        bookmarksCount: index?.count || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        lastAttemptedAt: index?.lastAttemptedAt ? new Date(index.lastAttemptedAt).toISOString() : null,
      },
    });
  } catch {
    // No bookmarks yet
    return NextResponse.json({
      status: "success",
      data: {
        needsRefresh: true,
        bookmarksCount: 0,
        lastFetchedAt: null,
        lastAttemptedAt: null,
      },
    });
  }
}
