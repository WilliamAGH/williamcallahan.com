/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to bookmarks with pagination support.
 */

import { getBookmarks, initializeBookmarksDataAccess } from "@/lib/bookmarks/bookmarks-data-access.server";
import { ServerCacheInstance } from "@/lib/server-cache";
import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import { type NextRequest, NextResponse } from "next/server";

// This route can leverage the caching within getBookmarks
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("[API Bookmarks] Received GET request for bookmarks");

  const searchParams = request.nextUrl.searchParams;
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);

  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

  // Get tag filter parameter
  const tagFilter = searchParams.get("tag") || null;

  try {
    // Ensure the data access layer is initialized (now synchronous)
    void initializeBookmarksDataAccess();

    const allBookmarks = await getBookmarks();
    const cacheInfo = ServerCacheInstance.getBookmarks();

    // Apply tag filter if provided
    let filteredBookmarks = allBookmarks;
    if (tagFilter) {
      // Decode the tag filter (handle URL encoding and slug format)
      const decodedTag = decodeURIComponent(tagFilter);

      filteredBookmarks = allBookmarks.filter((bookmark) => {
        const tags = normalizeTagsToStrings(bookmark.tags);
        // Case-insensitive tag matching
        return tags.some((tag) => tag.toLowerCase() === decodedTag.toLowerCase());
      });

      console.log(
        `[API Bookmarks] Filtering by tag "${decodedTag}": ${filteredBookmarks.length} of ${allBookmarks.length} bookmarks match`,
      );
    }

    // Calculate pagination on filtered results
    const offset = (page - 1) * limit;
    const paginatedBookmarks = filteredBookmarks.slice(offset, offset + limit);
    const totalPages = Math.ceil(filteredBookmarks.length / limit);

    console.log(
      `[API Bookmarks] Returning page ${page}/${totalPages} with ${paginatedBookmarks.length} bookmarks${tagFilter ? ` (filtered by tag: ${tagFilter})` : ""}`,
    );

    return NextResponse.json(
      {
        data: paginatedBookmarks,
        meta: {
          pagination: {
            page,
            limit,
            total: filteredBookmarks.length, // Use filtered count, not all bookmarks
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          filter: tagFilter ? { tag: tagFilter } : undefined, // Include filter info
          // Data version for client-side cache invalidation
          dataVersion: cacheInfo?.lastFetchedAt || Date.now(),
          lastRefreshed: cacheInfo?.lastFetchedAt ? new Date(cacheInfo.lastFetchedAt).toISOString() : null,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("[API Bookmarks] Failed to fetch bookmarks:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to fetch bookmarks", details: errorMessage }, { status: 500 });
  }
}
