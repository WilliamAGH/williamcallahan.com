/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to bookmarks with pagination support.
 */

import { getBookmarks } from "@/lib/data-access/bookmarks";
import { initializeBookmarksDataAccess } from "@/lib/data-access/bookmarks";
import { ServerCacheInstance } from "@/lib/server-cache";
import { type NextRequest, NextResponse } from "next/server";

// This route can leverage the caching within getBookmarks
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("[API Bookmarks] Received GET request for bookmarks");

  const searchParams = request.nextUrl.searchParams;
  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  
  const rawLimit = Number.parseInt(searchParams.get('limit') || '20', 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

  try {
    // Ensure the data access layer is initialized
    await initializeBookmarksDataAccess();
    
    const allBookmarks = await getBookmarks();
    const cacheInfo = ServerCacheInstance.getBookmarks();

    // Calculate pagination
    const offset = (page - 1) * limit;
    const paginatedBookmarks = allBookmarks.slice(offset, offset + limit);
    const totalPages = Math.ceil(allBookmarks.length / limit);

    console.log(
      `[API Bookmarks] Returning page ${page}/${totalPages} with ${paginatedBookmarks.length} bookmarks`,
    );

    return NextResponse.json({
      data: paginatedBookmarks,
      meta: {
        pagination: {
          page,
          limit,
          total: allBookmarks.length,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        },
        // Data version for client-side cache invalidation
        dataVersion: cacheInfo?.lastFetchedAt || Date.now(),
        lastRefreshed: cacheInfo?.lastFetchedAt ? new Date(cacheInfo.lastFetchedAt).toISOString() : null
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      }
    });
  } catch (error) {
    console.error('[API Bookmarks] Failed to fetch bookmarks:', error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: 'Failed to fetch bookmarks', details: errorMessage },
      { status: 500 }
    );
  }
}
