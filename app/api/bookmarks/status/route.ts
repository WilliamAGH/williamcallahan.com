/**
 * Bookmarks Health Check Endpoint
 *
 * Provides operational status of the bookmarks system including cache,
 * storage, and lock states for monitoring and debugging
 */

import { NextResponse } from "next/server";
import { ServerCacheInstance } from "@/lib/server-cache";
import type { BookmarksCacheEntry, CacheStats } from "@/types/cache";

export const dynamic = "force-dynamic";

/**
 * GET /api/bookmarks/status
 * @description Returns the status of the bookmarks cache.
 * @returns {NextResponse}
 */
export function GET(): NextResponse {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({
      error: "This endpoint is only available in development mode.",
    });
  }

  const bookmarksEntry: BookmarksCacheEntry | undefined = ServerCacheInstance.getBookmarks();
  const stats: CacheStats | undefined = ServerCacheInstance.getStats ? ServerCacheInstance.getStats() : undefined;

  const response = {
    lastFetchedAt: bookmarksEntry?.lastFetchedAt,
    lastAttemptedAt: bookmarksEntry?.lastAttemptedAt,
    isStale: ServerCacheInstance.shouldRefreshBookmarks(),
    cacheSize: bookmarksEntry?.bookmarks?.length,
    stats,
  };

  return NextResponse.json(response);
}
