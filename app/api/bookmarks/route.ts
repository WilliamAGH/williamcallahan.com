/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to all bookmarks using the centralized data-access layer.
 */

import { NextResponse } from 'next/server';
import { getBookmarks } from '@/lib/data-access'; // Use the new data-access layer
import type { NextRequest } from 'next/server';

// This route can leverage the caching within getBookmarks
export const dynamic = 'force-dynamic'; // Or 'auto' if getBookmarks handles revalidation well

export async function GET(request: NextRequest) {
  console.log('[API Bookmarks] Received GET request for bookmarks');

  // The build_prefetch query param can be handled by getBookmarks if needed,
  // or the data-access layer can be designed to always ensure data freshness
  // for build processes if it detects such an environment.
  // For simplicity, we'll assume getBookmarks handles this.

  try {
    const bookmarks = await getBookmarks();

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
