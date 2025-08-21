/**
 * Bookmarks Cache API Route
 *
 * Provides API endpoints for managing the bookmarks cache.
 * - GET: Returns the current status of the bookmarks (from S3)
 * - POST: Forces a refresh of the bookmarks from external API
 * - DELETE: Clears the bookmarks cache metadata
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import { readJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { DataFetchOperationSummary } from "@/types/lib";
import { NextResponse } from "next/server";
import type { BookmarksIndex } from "@/types/bookmark";
import { invalidateBookmarksCache } from "@/lib/bookmarks/bookmarks-data-access.server";

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

/**
 * API Key validation middleware
 * @param request - The HTTP request
 * @returns Boolean indicating if the request has a valid API key
 */
function validateApiKey(request: Request): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return false;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return false;

  // Check 'Bearer TOKEN' format
  const [type, token] = authHeader.split(" ");
  if (type !== "Bearer" || !token) return false;

  return token === apiKey;
}

/**
 * GET handler - Returns current status of the bookmarks
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Read from S3 index for metadata
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    const needsRefresh = ServerCacheInstance.shouldRefreshBookmarks();

    return NextResponse.json({
      status: "success",
      data: {
        cached: !!index,
        bookmarksCount: index?.count || 0,
        totalPages: index?.totalPages || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
        lastModified: index?.lastModified || null,
        needsRefresh,
      },
    });
  } catch {
    // If we can't read the index, bookmarks don't exist
    return NextResponse.json({
      status: "success",
      data: {
        cached: false,
        bookmarksCount: 0,
        totalPages: 0,
        lastFetchedAt: null,
        lastModified: null,
        needsRefresh: true,
      },
    });
  }
}

/**
 * POST handler - Forces a refresh of the bookmarks
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use DataFetchManager for centralized data fetching
    const { DataFetchManager } = await import("@/lib/server/data-fetch-manager");
    const manager = new DataFetchManager();
    const results = await manager.fetchData({
      bookmarks: true,
      forceRefresh: true,
    });

    const bookmarkResult: DataFetchOperationSummary | undefined = results.find(r => r.operation === "bookmarks");
    if (!bookmarkResult?.success) {
      throw new Error(bookmarkResult?.error ?? "Bookmark refresh failed");
    }

    // Invalidate Next.js cache for bookmarks
    invalidateBookmarksCache();

    // Read updated index from S3
    const index = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);

    return NextResponse.json({
      status: "success",
      message: "Bookmarks refreshed successfully",
      data: {
        bookmarksCount: index?.count || 0,
        lastFetchedAt: index?.lastFetchedAt ? new Date(index.lastFetchedAt).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Failed to refresh bookmarks:", error);
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
 * DELETE handler - Clears the bookmarks cache metadata
 */
export function DELETE(request: Request): NextResponse {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Clear cache metadata
    ServerCacheInstance.clearBookmarks();

    // Invalidate Next.js cache for bookmarks
    invalidateBookmarksCache();

    return NextResponse.json({
      status: "success",
      message: "Bookmarks cache metadata cleared successfully",
    });
  } catch (error) {
    console.error("Failed to clear bookmarks cache:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to clear bookmarks cache",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
