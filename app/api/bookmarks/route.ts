/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to all bookmarks using the centralized data-access layer.
 */

import { NextResponse } from 'next/server';
import { getBookmarks } from '@/lib/data-access/bookmarks';
import type { NextRequest } from 'next/server';
import { BookmarkRefreshQueue } from '@/lib/async-job-queue';
import { ServerCacheInstance } from '@/lib/server-cache';

// This route can leverage the caching within getBookmarks
export const dynamic = 'force-dynamic'; // Or 'auto' if getBookmarks handles revalidation well

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[API Bookmarks] Received GET request for bookmarks');

  const isRefresh = request.nextUrl.searchParams.has('refresh');

  if (isRefresh) {
  try {
    BookmarkRefreshQueue.add(async () => {
      await getBookmarks(false);
    });
  } catch (queueError) {
    console.error('[API Bookmarks] Failed to queue refresh job:', queueError);
    return NextResponse.json(
      { error: 'Failed to queue refresh' },
      { status: 500 }
    );
  }
    return NextResponse.json({ queued: true }, { status: 202 });
  }

  // Allow background refresh to occur; do not skip external fetch
  const skipExternalFetch = false;

  try {
    const bookmarks = await getBookmarks(skipExternalFetch);
    if (ServerCacheInstance.shouldRefreshBookmarks()) {
      // Only queue if not already processing AND queue is empty
      if (!BookmarkRefreshQueue.isProcessing && BookmarkRefreshQueue.queueLength === 0) {
        BookmarkRefreshQueue.add(async () => {
          await getBookmarks(false);
        });
      }
    }

    if (bookmarks && bookmarks.length > 0) {
      console.log(`[API Bookmarks] Successfully retrieved ${bookmarks.length} bookmarks via data-access layer.`);
      return NextResponse.json(bookmarks, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600', // Example caching strategy
          'X-Data-Complete': 'true' // Assuming getBookmarks returns complete data or throws
        }
      });
    }

    console.log('[API Bookmarks] No bookmarks found via data-access layer.');
    return NextResponse.json([], {
      status: 200, // Return 200 with empty array if no bookmarks, or 404 if preferred
      headers: {
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
        'X-Data-Complete': 'true' // No data is also "complete" in a sense
      }
    });
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
