/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks.
 * This endpoint is rate-limited to prevent abuse.
 */
import "server-only";

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { isOperationAllowed } from "@/lib/rate-limiter";
import {
  API_ENDPOINT_STORE_NAME,
  DEFAULT_API_ENDPOINT_LIMIT_CONFIG,
  BOOKMARKS_CACHE_DURATION,
} from "@/lib/constants";
import { logEnvironmentConfig } from "@/lib/config/environment";
import { getClientIp } from "@/lib/utils/request-utils";
import { buildApiRateLimitResponse } from "@/lib/utils/api-utils";
import logger from "@/lib/utils/logger";
import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { getMonotonicTime } from "@/lib/utils";

// Ensure this route is not statically cached

let isRefreshInProgress = false;

/**
 * POST handler - Refreshes the bookmarks
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const headerStore = request.headers;
  const authorizationHeader = headerStore.get("authorization");
  const cronRefreshSecret = process.env.BOOKMARK_CRON_REFRESH_SECRET;

  let isCronJob = false;

  // Log API trigger immediately
  console.log(`[API Trigger] Bookmarks refresh endpoint called at ${new Date().toISOString()}`);

  // Check for custom secret authentication
  if (cronRefreshSecret && authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    const token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    if (token === cronRefreshSecret) {
      isCronJob = true;
      console.log("[API Trigger] ✅ Authenticated as external cron job via bearer token");
      logger.info(
        "[API Bookmarks Refresh] Authenticated as cron job via BOOKMARK_CRON_REFRESH_SECRET.",
      );
    }
  }

  // Get client IP for rate limiting (only if not an authenticated cron job)
  if (!isCronJob) {
    const clientIp = getClientIp(headerStore, { fallback: "unknown_ip" });
    console.log(`[API Trigger] Regular request from IP: ${clientIp}`);
    if (!isOperationAllowed(API_ENDPOINT_STORE_NAME, clientIp, DEFAULT_API_ENDPOINT_LIMIT_CONFIG)) {
      console.log(`[API Trigger] ❌ Rate limit exceeded for IP: ${clientIp}`);
      return buildApiRateLimitResponse({
        retryAfterSeconds: Math.ceil(DEFAULT_API_ENDPOINT_LIMIT_CONFIG.windowMs / 1000),
        rateLimitScope: "bookmarks-refresh",
        rateLimitLimit: DEFAULT_API_ENDPOINT_LIMIT_CONFIG.maxRequests,
        rateLimitWindowSeconds: Math.ceil(DEFAULT_API_ENDPOINT_LIMIT_CONFIG.windowMs / 1000),
      });
    }
  }

  // Log environment configuration to ensure correct paths are used
  if (process.env.NODE_ENV !== "production") {
    logEnvironmentConfig();
  }

  try {
    // Check if refresh is already in progress
    if (isRefreshInProgress) {
      console.log("[API Trigger] ⚠️  Refresh already in progress, skipping");
      logger.info("[API Bookmarks Refresh] Refresh already in progress, returning early");
      return NextResponse.json({
        status: "success",
        message: "Refresh already in progress",
        data: {
          refreshed: false,
          refreshInProgress: true,
        },
      });
    }

    // For cron jobs, always refresh. For others, check if refresh is needed.
    if (!isCronJob) {
      const index = await getBookmarksIndex();

      if (index?.lastFetchedAt) {
        const timeSinceLastFetch = getMonotonicTime() - index.lastFetchedAt;
        const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;

        if (timeSinceLastFetch <= revalidationThreshold) {
          logger.info("[API Bookmarks Refresh] Regular request: Bookmarks are already up to date.");
          return NextResponse.json({
            status: "success",
            message: "Bookmarks are already up to date",
            data: {
              refreshed: false,
              bookmarksCount: index?.count || 0,
              lastFetchedAt: index?.lastFetchedAt
                ? new Date(index.lastFetchedAt).toISOString()
                : null,
              lastFetchedAtTs: index?.lastFetchedAt ?? null,
              changeDetected: index?.changeDetected ?? null,
            },
          });
        }
      }
    }

    if (isCronJob) {
      console.log("[API Trigger] 🔄 FORCING bookmark refresh (external cron job)");
      logger.info("[API Bookmarks Refresh] Cron job: Forcing bookmark data refresh.");
    } else {
      console.log("[API Trigger] 🔄 Starting bookmark refresh (manual/API request)");
      logger.info(
        "[API Bookmarks Refresh] Regular request: Refreshing bookmarks data as they are stale or need update.",
      );
    }

    // Get previous count from bookmark index state
    let previousCount = 0;
    let previousIndex: Awaited<ReturnType<typeof getBookmarksIndex>> = null;
    try {
      previousIndex = await getBookmarksIndex();
      previousCount = previousIndex?.count || 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[API Trigger] Failed to read previous index: ${message}`);
    }

    console.log(`[API Trigger] Previous count: ${previousCount} bookmarks`);
    logger.info(`[API Bookmarks Refresh] Previous bookmarks count: ${previousCount}`);

    // Set the flag to prevent concurrent refreshes
    isRefreshInProgress = true;
    console.log("[API Trigger] 🔒 Setting refresh lock");

    // Use DataFetchManager for centralized data fetching
    const manager = new DataFetchManager();

    // Start refresh in background (non-blocking)
    const refreshPromise = manager.fetchData({
      bookmarks: true,
      forceRefresh: isCronJob, // Only force refresh for cron jobs
      immediate: false, // Don't process logos immediately to reduce memory pressure
    });

    // Handle errors in background without blocking response
    void refreshPromise
      .then((results) => {
        const bookmarkResult = results.find((r) => r.operation === "bookmarks");
        if (bookmarkResult?.success) {
          const newCount = bookmarkResult.itemsProcessed || 0;
          console.log(
            `[API Trigger] ✅ Refresh completed: ${newCount} bookmarks (was ${previousCount})`,
          );
          logger.info(`[API Bookmarks Refresh] Background refresh completed successfully`);

          // Invalidate Next.js cache to serve fresh data
          console.log("[API Trigger] Invalidating Next.js cache for bookmarks...");
          try {
            revalidatePath("/bookmarks");
            revalidatePath("/bookmarks/[slug]", "page");
            revalidatePath("/bookmarks/page/[pageNumber]", "page");
            revalidatePath("/bookmarks/domain/[domainSlug]", "page");
            revalidateTag("bookmarks", "max");
            console.log("[API Trigger] ✅ Cache invalidated successfully");
          } catch (cacheError) {
            console.error("[API Trigger] Failed to invalidate cache:", cacheError);
          }
        } else {
          console.log(`[API Trigger] ❌ Refresh failed: ${bookmarkResult?.error}`);
          logger.error(`[API Bookmarks Refresh] Background refresh failed:`, bookmarkResult?.error);
        }
        return undefined;
      })
      .catch((error) => {
        console.log(`[API Trigger] ❌ Refresh error: ${error}`);
        logger.error(`[API Bookmarks Refresh] Background refresh error:`, error);
        // Check if memory related
        if ((error as Error).message?.includes("memory")) {
          console.log(
            `[API Trigger] ⚠️  Memory exhaustion detected - container restart may be needed`,
          );
          logger.error(
            `[API Bookmarks Refresh] Memory exhaustion detected. Container restart may be needed.`,
          );
        }
      })
      .finally(() => {
        // Always clear the flag when refresh completes
        isRefreshInProgress = false;
        console.log("[API Trigger] 🔓 Clearing refresh lock");
        logger.info("[API Bookmarks Refresh] Refresh lock cleared");
      });

    // Return immediately without waiting
    console.log(`[API Trigger] 📤 Returning response (refresh continues in background)`);
    logger.info(`[API Bookmarks Refresh] Started background refresh process`);

    return NextResponse.json({
      status: "success",
      message: `Bookmark refresh started in background${isCronJob ? " (triggered by cron job)" : ""}`,
      data: {
        refreshStarted: true,
        previousCount,
        changeDetected: previousIndex?.changeDetected ?? null,
        lastFetchedAt: previousIndex?.lastFetchedAt
          ? new Date(previousIndex.lastFetchedAt).toISOString()
          : null,
        lastFetchedAtTs: previousIndex?.lastFetchedAt ?? null,
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
    const index = await getBookmarksIndex();

    // Check if refresh is needed based on timing
    let needsRefresh = true;
    if (index?.lastFetchedAt) {
      const timeSinceLastFetch = getMonotonicTime() - index.lastFetchedAt;
      const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;
      needsRefresh = timeSinceLastFetch > revalidationThreshold;
    }

    return NextResponse.json({
      status: "success",
      data: {
        needsRefresh,
        bookmarksCount: index?.count || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        lastAttemptedAt: index?.lastAttemptedAt
          ? new Date(index.lastAttemptedAt).toISOString()
          : null,
        lastFetchedAtTs: index?.lastFetchedAt ?? null,
        lastAttemptedAtTs: index?.lastAttemptedAt ?? null,
        changeDetected: index?.changeDetected ?? null,
      },
    });
  } catch (error) {
    logger.error("Failed to check bookmark refresh status:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to check bookmark refresh status",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
