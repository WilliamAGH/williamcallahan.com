/**
 * Bookmarks Cache API Route
 *
 * Provides API endpoints for managing the bookmarks cache.
 * - GET: Returns the current status of the bookmarks cache
 * - POST: Forces a refresh of the bookmarks cache
 * - DELETE: Clears the bookmarks cache
 */

import { ServerCacheInstance } from "@/lib/server-cache";
import type { DataFetchOperationSummary } from "@/types/lib";
import { NextResponse } from "next/server";

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
 * GET handler - Returns current status of the bookmarks cache
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use Promise.resolve to satisfy require-await rule
  const cached = await Promise.resolve(ServerCacheInstance.getBookmarks());
  const needsRefresh = await Promise.resolve(ServerCacheInstance.shouldRefreshBookmarks());

  return NextResponse.json({
    status: "success",
    data: {
      cached: !!cached,
      bookmarksCount: cached?.bookmarks.length || 0,
      lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      lastAttemptedAt: cached?.lastAttemptedAt ? new Date(cached.lastAttemptedAt).toISOString() : null,
      needsRefresh,
    },
  });
}

/**
 * POST handler - Forces a refresh of the bookmarks cache
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

    const bookmarkResult: DataFetchOperationSummary | undefined = results.find((r) => r.operation === "bookmarks");
    if (!bookmarkResult?.success) {
      throw new Error(bookmarkResult?.error ?? "Bookmark refresh failed");
    }

    const cached = ServerCacheInstance.getBookmarks();

    return NextResponse.json({
      status: "success",
      message: "Bookmarks cache refreshed successfully",
      data: {
        bookmarksCount: cached?.bookmarks.length || 0,
        lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      },
    });
  } catch (error) {
    console.error("Failed to refresh bookmarks cache:", error);
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
 * DELETE handler - Clears the bookmarks cache
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use Promise.resolve to satisfy require-await rule
    await Promise.resolve(ServerCacheInstance.clearBookmarks());

    return NextResponse.json({
      status: "success",
      message: "Bookmarks cache cleared successfully",
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
