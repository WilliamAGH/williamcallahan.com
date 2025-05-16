import { NextResponse } from 'next/server';
import { refreshGitHubActivityDataFromApi } from '@/lib/data-access';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic'; // Ensure this route is always dynamic

/**
 * API route to trigger a refresh of the GitHub activity data.
 * This will fetch fresh data from the GitHub API, process it, and update S3.
 *
 * HTTP Method: POST
 */
export async function POST(request: NextRequest) { // eslint-disable-line @typescript-eslint/no-unused-vars
  // Optional: Add security checks here (e.g., a secret key, admin authentication)
  // For example, check for a specific header or a secret in the body:
  // const secret = request.headers.get('x-refresh-secret');
  // if (secret !== process.env.GITHUB_REFRESH_SECRET) {
  //   return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  // }

  console.log('[API Refresh] Received request to refresh GitHub activity data.');

  try {
    // Asynchronously trigger the refresh process.
    // We don't necessarily need to wait for it to complete here if it's long-running,
    // but for now, we will await it to provide a clearer response.
    const result = await refreshGitHubActivityDataFromApi();

    if (result) {
      console.log('[API Refresh] GitHub activity data refresh completed successfully.');
      return NextResponse.json({
        message: 'GitHub activity data refresh completed successfully.',
        dataFetched: true,
        trailingYearCommits: result.trailingYearData.totalContributions,
        allTimeCommits: result.allTimeData.totalContributions
      }, { status: 200 });
    } else {
      console.warn('[API Refresh] GitHub activity data refresh process started but returned no data or failed internally.');
      return NextResponse.json({
        message: 'GitHub activity data refresh process initiated but may have failed or returned no data. Check server logs.',
        dataFetched: false,
      }, { status: 500 });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('[API Refresh] Critical error during GitHub activity data refresh:', errorMessage);
    return NextResponse.json(
      { message: 'Failed to refresh GitHub activity data.', error: errorMessage },
      { status: 500 }
    );
  }
}