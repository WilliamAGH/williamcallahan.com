/**
 * Bookmarks Health Check Endpoint
 *
 * Provides operational status of the bookmarks system including cache,
 * storage, and lock states for monitoring and debugging
 */

import type { DistributedLockEntry } from "@/types/s3";
import { NextResponse } from "next/server";
import { ServerCacheInstance } from "@/lib/server-cache";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";

export async function GET() {
  try {
    // Check cache status
    const cacheInfo = ServerCacheInstance.getBookmarks();
    const stats = ServerCacheInstance.getStats
      ? ServerCacheInstance.getStats()
      : {
          hits: 0,
          misses: 0,
          sets: 0,
          deletes: 0,
        };

    // Check S3 connectivity
    let s3Status = "ok";
    let lockInfo: DistributedLockEntry | null = null;
    try {
      lockInfo = await readJsonS3<DistributedLockEntry>(BOOKMARKS_S3_PATHS.LOCK);
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error.name === "NoSuchKey" ||
          (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404);
      if (!isNotFound) {
        s3Status = "degraded";
      }
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      cache: {
        hasData: !!cacheInfo?.bookmarks?.length,
        bookmarkCount: cacheInfo?.bookmarks?.length || 0,
        lastRefreshed: cacheInfo?.lastFetchedAt ? new Date(cacheInfo.lastFetchedAt).toISOString() : null,
        shouldRefresh: ServerCacheInstance.shouldRefreshBookmarks(),
        stats,
      },
      storage: {
        s3: {
          status: s3Status,
          lockActive: !!lockInfo,
          lockOwner: lockInfo?.instanceId,
        },
      },
    });
  } catch (error) {
    console.error("[Health Check] Error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
