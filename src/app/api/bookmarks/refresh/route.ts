/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks.
 * This endpoint is rate-limited to prevent abuse.
 */
import "server-only";

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { isOperationAllowed } from "@/lib/rate-limiter";
import {
  API_ENDPOINT_STORE_NAME,
  DEFAULT_API_ENDPOINT_LIMIT_CONFIG,
  BOOKMARKS_S3_PATHS,
  BOOKMARKS_CACHE_DURATION,
} from "@/lib/constants";
import { readJsonS3 } from "@/lib/s3-utils";
import { logEnvironmentConfig } from "@/lib/config/environment";
import logger from "@/lib/utils/logger";
import { type NextRequest, NextResponse } from "next/server";
import type { BookmarksIndex } from "@/types/bookmark";
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
      logger.info("[API Bookmarks Refresh] Authenticated as cron job via BOOKMARK_CRON_REFRESH_SECRET.");
    }
  }

  // Get client IP for rate limiting (only if not an authenticated cron job)
  if (!isCronJob) {
    const forwardedFor: string = headerStore.get("x-forwarded-for") || "unknown";
    const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown_ip"; // Ensure clientIp is never empty
    console.log(`[API Trigger] Regular request from IP: ${clientIp}`);
    if (!isOperationAllowed(API_ENDPOINT_STORE_NAME, clientIp, DEFAULT_API_ENDPOINT_LIMIT_CONFIG)) {
      console.log(`[API Trigger] ❌ Rate limit exceeded for IP: ${clientIp}`);
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Try again later.",
        },
        { status: 429 },
      );
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

    // Check memory pressure before starting heavy operation
    if (typeof process !== "undefined" && process.memoryUsage) {
      const { rss } = process.memoryUsage();
      const memoryLimitMB = 512; // Conservative limit
      const memoryUsedMB = Math.round(rss / 1024 / 1024);

      if (memoryUsedMB > memoryLimitMB * 0.8) {
        console.log(`[API Trigger] ⚠️  High memory usage: ${memoryUsedMB}MB, deferring refresh`);
        logger.warn(`[API Bookmarks Refresh] High memory usage: ${memoryUsedMB}MB, deferring refresh`);
        return NextResponse.json({
          status: "success",
          message: "Refresh deferred due to high memory usage",
          data: {
            refreshed: false,
            memoryUsage: `${memoryUsedMB}MB`,
            reason: "memory_pressure",
          },
        });
      }
    }

    // For cron jobs, always refresh. For others, check if refresh is needed.
    if (!isCronJob) {
      // Read current index from S3 to check timing
      const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

      if (index?.lastFetchedAt) {
        const timeSinceLastFetch = getMonotonicTime() - new Date(index.lastFetchedAt).getTime();
        const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;

        if (timeSinceLastFetch <= revalidationThreshold) {
          logger.info("[API Bookmarks Refresh] Regular request: Bookmarks are already up to date.");
          return NextResponse.json({
            status: "success",
            message: "Bookmarks are already up to date",
            data: {
              refreshed: false,
              bookmarksCount: index?.count || 0,
              lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
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

    // Get previous count from S3 index
    let previousCount = 0;
    let previousIndex: BookmarksIndex | null = null;
    try {
      previousIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
      previousCount = previousIndex?.count || 0;
    } catch {
      // Index doesn't exist yet
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
    refreshPromise
      .then(results => {
        const bookmarkResult = results.find(r => r.operation === "bookmarks");
        if (bookmarkResult?.success) {
          const newCount = bookmarkResult.itemsProcessed || 0;
          console.log(`[API Trigger] ✅ Refresh completed: ${newCount} bookmarks (was ${previousCount})`);
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
      })
      .catch(error => {
        console.log(`[API Trigger] ❌ Refresh error: ${error}`);
        logger.error(`[API Bookmarks Refresh] Background refresh error:`, error);
        // Check if memory related
        if ((error as Error).message?.includes("memory")) {
          console.log(`[API Trigger] ⚠️  Memory exhaustion detected - container restart may be needed`);
          logger.error(`[API Bookmarks Refresh] Memory exhaustion detected. Container restart may be needed.`);
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
        lastFetchedAt: previousIndex?.lastFetchedAt ? new Date(previousIndex.lastFetchedAt).toISOString() : null,
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
    // Read from S3 index
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    // Check if refresh is needed based on timing
    let needsRefresh = true;
    if (index?.lastFetchedAt) {
      const timeSinceLastFetch = getMonotonicTime() - new Date(index.lastFetchedAt).getTime();
      const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;
      needsRefresh = timeSinceLastFetch > revalidationThreshold;
    }

    return NextResponse.json({
      status: "success",
      data: {
        needsRefresh,
        bookmarksCount: index?.count || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        lastAttemptedAt: index?.lastAttemptedAt ? new Date(index.lastAttemptedAt).toISOString() : null,
        lastFetchedAtTs: index?.lastFetchedAt ?? null,
        lastAttemptedAtTs: index?.lastAttemptedAt ?? null,
        changeDetected: index?.changeDetected ?? null,
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
        changeDetected: null,
      },
    });
  }
}
