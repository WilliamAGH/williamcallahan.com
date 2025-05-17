/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to all bookmarks using the centralized data-access layer.
 */

import { NextResponse } from 'next/server';
import { getBookmarks } from '@/lib/data-access/bookmarks';
import type { NextRequest } from 'next/server';

// This route can leverage the caching within getBookmarks
export const dynamic = 'force-dynamic'; // Or 'auto' if getBookmarks handles revalidation well

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[API Bookmarks] Received GET request for bookmarks');

  // Check if this is a refresh request
  const isRefresh = request.nextUrl.searchParams.has('refresh');

  // When handling API requests, we want to avoid circular dependencies
  // For regular GET requests, we'll skip external fetching if we're in the API route
  // For explicit refresh requests, we'll allow the external fetch
  const skipExternalFetch = !isRefresh;

  try {
    const bookmarks = await getBookmarks(skipExternalFetch);

    if (bookmarks && bookmarks.length > 0) {
      console.log(`[API Bookmarks] Successfully retrieved ${bookmarks.length} bookmarks via data-access layer.`);
      return NextResponse.json(bookmarks, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600', // Example caching strategy
          'X-Data-Complete': 'true' // Assuming getBookmarks returns complete data or throws
        }
      });
    } else {
      console.log('[API Bookmarks] No bookmarks found via data-access layer.');
      return NextResponse.json([], {
        status: 200, // Return 200 with empty array if no bookmarks, or 404 if preferred
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
          'X-Data-Complete': 'true' // No data is also "complete" in a sense
        }
      });
    }
  } catch (error) {
    console.error('[API Bookmarks] Critical error in GET handler for bookmarks:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    // getBookmarks should ideally handle its own errors and return null or empty,
    // but we catch here as a fallback.
    return NextResponse.json(
      { error: 'Failed to process bookmarks', details: errorMessage },
      {
        status: 500,
        headers: {
          'X-Data-Complete': 'false'
        }
      }
    );
  }
}
