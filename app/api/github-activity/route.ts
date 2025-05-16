/**
 * GitHub Activity API Endpoint
 *
 * Provides client-side access to GitHub activity data by reading pre-processed data from S3 (via data-access layer).
 * It does NOT trigger a new fetch from GitHub.
 *
 * Query Parameters:
 *   - refresh=true: This parameter is now ignored by this GET endpoint. Refreshing data should be done
 *                   via the POST /api/github-activity/refresh endpoint.
 *   - force-cache=true: This parameter is also effectively ignored as the data-access layer handles its own caching.
 */

import { NextResponse } from 'next/server';
import { getGithubActivity } from '@/lib/data-access';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('[API GET /github-activity] Received request.');

  // The 'refresh' and 'force-cache' query params are no longer used by this GET endpoint
  // as getGithubActivity is now S3-read-only and refresh is handled by POST /api/github-activity/refresh
  const url = new URL(request.url);
  const refreshParam = url.searchParams.get('refresh');
  if (refreshParam === 'true') {
    console.log('[API GET /github-activity] \'refresh=true\' param is deprecated for GET. Use POST /api/github-activity/refresh to update data.');
  }

  try {
    const activityData = await getGithubActivity();

    if (activityData) {
      return NextResponse.json(activityData);
    } else {
      console.warn('[API GET /github-activity] GitHub activity data not found in cache or S3. A refresh may be needed.');
      return NextResponse.json(
        {
          error: 'GitHub activity data not available.',
          details: 'The data may not have been generated yet or a refresh is in progress. Please try again later or trigger a refresh via the POST /api/github-activity/refresh endpoint.',
          // Optionally, provide some minimal structure if clients expect it
          trailingYearData: null,
          cumulativeAllTimeData: null,
        },
        { status: 404 } // Or 503 Service Unavailable might also be appropriate
      );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('[API GET /github-activity] Error fetching GitHub activity data:', errorMessage);
    return NextResponse.json(
      { error: 'Failed to retrieve GitHub activity data.', details: errorMessage },
      { status: 500 }
    );
  }
}
