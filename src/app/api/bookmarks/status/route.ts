/**
 * Bookmarks Health Check Endpoint
 *
 * Provides operational status of the bookmarks system including S3 storage
 * and cache metadata for monitoring and debugging
 */

import { NextResponse } from "next/server";
import { readJsonS3Optional } from "@/lib/s3/json";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_CACHE_DURATION } from "@/lib/constants";
import { bookmarksIndexSchema, type BookmarksIndex } from "@/types/bookmark";
import { getMonotonicTime } from "@/lib/utils";

/**
 * GET /api/bookmarks/status
 * @description Returns the status of the bookmarks system.
 * @returns {NextResponse}
 */
export async function GET(): Promise<NextResponse> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({
      error: "This endpoint is only available in development mode.",
    });
  }

  try {
    const index = await readJsonS3Optional<BookmarksIndex>(
      BOOKMARKS_S3_PATHS.INDEX,
      bookmarksIndexSchema,
    );

    // Check if refresh is needed based on timing
    let needsRefresh = true;
    if (index?.lastFetchedAt) {
      const timeSinceLastFetch = getMonotonicTime() - new Date(index.lastFetchedAt).getTime();
      const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;
      needsRefresh = timeSinceLastFetch > revalidationThreshold;
    }

    const response = {
      // S3 storage info
      storage: {
        exists: !!index,
        bookmarkCount: index?.count || 0,
        totalPages: index?.totalPages || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        lastModified: index?.lastModified || null,
        hasChecksum: !!index?.checksum,
      },
      // Cache metadata
      cache: {
        needsRefresh,
        message: "Cache statistics are no longer available with Next.js cache",
      },
      // System info
      system: {
        environment: process.env.NODE_ENV,
        s3Bucket: process.env.S3_BUCKET || "not-configured",
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to read bookmarks status from S3:", error);
    return NextResponse.json(
      {
        error: "Failed to read bookmarks status",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
