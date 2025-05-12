/**
 * GitHub Activity API Endpoint
 *
 * Provides client-side access to GitHub activity data using the centralized data-access layer.
 */

import { NextResponse } from 'next/server';
import { getGithubActivity } from '@/lib/data-access'; // Use the data-access layer
import { deleteFromS3, readJsonS3 } from '@/lib/s3-utils';
import type { NextRequest } from 'next/server';
import type { GitHubActivityApiResponse, GitHubActivitySummary } from '@/types/github';

// This route can leverage the caching within getGithubActivity
export const dynamic = 'force-dynamic';

// Add VERBOSE const if not already present (assuming it might be used for logging)
const VERBOSE = process.env.VERBOSE === 'true' || false;

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (VERBOSE) console.log('[API GitHub Activity] Received GET request.');
  const url = new URL(request.url);
  if (url.searchParams.get('refresh') === 'true') {
    if (VERBOSE) console.log('[API GitHub Activity] Refresh requested. Clearing relevant S3 caches...');
    try {
      // Clearing the main activity file (which holds trailing year raw data + calendar)
      // and the two summary files.
      await Promise.all([
        deleteFromS3('github-activity/activity_data.json'),
        deleteFromS3('github-activity/github_stats_summary.json'),
        deleteFromS3('github-activity/github_stats_summary_all_time.json')
      ]);
      if (VERBOSE) console.log('[API GitHub Activity] S3 cache files cleared for refresh.');
    } catch (err) {
      if (VERBOSE) console.warn('[API GitHub Activity] Failed to delete one or more S3 cache files for refresh:', err);
    }
  }

  try {
    const activityApiResponse = await getGithubActivity(); // This now returns the structure with undefined summaries

    if (!activityApiResponse) {
      console.warn('[API GitHub Activity] No GitHub activity data returned from data-access layer.');
      return NextResponse.json({ error: 'No GitHub activity data available' }, { status: 404, headers: { 'X-Data-Complete': 'false' } });
    }

    // Create a mutable payload from the response
    const payload: GitHubActivityApiResponse = { ...activityApiResponse };

    // Load and inject Trailing Year Summary
    try {
      const trailingYearSummary = await readJsonS3<GitHubActivitySummary>('github-activity/github_stats_summary.json');
      if (trailingYearSummary && payload.trailingYearData) {
        payload.trailingYearData.summaryActivity = trailingYearSummary;
        if (VERBOSE) console.log('[API GitHub Activity] Trailing year summary loaded and injected.');
      } else {
        console.warn('[API GitHub Activity] Could not load trailing year summary or trailingYearData missing in payload.');
      }
    } catch (err) {
      console.warn('[API GitHub Activity] Failed to load trailing year summary JSON from S3:', err);
    }

    // Load and inject All-Time Summary
    try {
      const allTimeSummary = await readJsonS3<GitHubActivitySummary>('github-activity/github_stats_summary_all_time.json');
      if (allTimeSummary && payload.cumulativeAllTimeData) {
        payload.cumulativeAllTimeData.summaryActivity = allTimeSummary;
        if (VERBOSE) console.log('[API GitHub Activity] All-time summary loaded and injected.');
      } else {
        console.warn('[API GitHub Activity] Could not load all-time summary or cumulativeAllTimeData missing in payload.');
      }
    } catch (err) {
      console.warn('[API GitHub Activity] Failed to load all-time summary JSON from S3:', err);
    }

    console.log('[API GitHub Activity] Successfully prepared GitHub activity payload.');
    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        // Overall completeness might be a bit nuanced now. The client should check segment-specific dataComplete flags.
        'X-Data-Complete': (payload.trailingYearData?.dataComplete && payload.cumulativeAllTimeData?.dataComplete) ? 'true' : 'false'
      }
    });
  } catch (error) {
    console.error('[API GitHub Activity] Critical error in GET handler:', error);
    return NextResponse.json({ error: 'Failed to process GitHub activity', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: { 'X-Data-Complete': 'false' } });
  }
}
