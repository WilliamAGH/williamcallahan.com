/**
 * GitHub Activity API Endpoint
 *
 * Provides client-side access to GitHub activity data using the centralized data-access layer.
 */

import { NextResponse } from 'next/server';
import { getGithubActivity } from '@/lib/data-access'; // Use the data-access layer
import type { NextRequest } from 'next/server';

// This route can leverage the caching within getGithubActivity
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[API GitHub Activity] Received GET request for GitHub activity');

  const searchParams = request.nextUrl.searchParams;
  const refresh = searchParams.get('refresh') === 'true';
  const forceCache = searchParams.get('force-cache') === 'true';

  try {
    // In a more sophisticated implementation, you might want to pass refresh and forceCache
    // parameters to getGithubActivity if it supports them
    const activityData = await getGithubActivity();

    if (activityData) {
      console.log(`[API GitHub Activity] Successfully retrieved GitHub activity via data-access layer.`);
      return NextResponse.json(activityData, {
        status: 200,
        headers: {
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400', // Cache for 1 hour, stale for 24 hours
          'X-Data-Complete': activityData.dataComplete ? 'true' : 'false'
        }
      });
    } else {
      console.log('[API GitHub Activity] No GitHub activity found via data-access layer.');
      return NextResponse.json(
        { error: 'No GitHub activity data available' },
        {
          status: 404,
          headers: {
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600',
            'X-Data-Complete': 'false'
          }
        }
      );
    }
  } catch (error) {
    console.error('[API GitHub Activity] Critical error in GET handler:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';

    return NextResponse.json(
      { error: 'Failed to process GitHub activity', details: errorMessage },
      {
        status: 500,
        headers: {
          'X-Data-Complete': 'false'
        }
      }
    );
  }
}
