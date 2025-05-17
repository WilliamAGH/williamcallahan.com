import { NextResponse } from 'next/server';
import { refreshGitHubActivityDataFromApi } from '@/lib/data-access/github';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Handles POST requests to refresh GitHub activity data via a protected API route.
 *
 * Validates the `x-refresh-secret` header against the server's configured secret. If authorized, fetches the latest GitHub activity data, processes it, and updates the data store. Responds with the outcome of the refresh operation.
 *
 * @returns A JSON response indicating success or failure, including commit statistics if successful.
 *
 * @throws {Error} If an unexpected error occurs during the refresh process.
 *
 * @remark Returns a 401 Unauthorized response if the `x-refresh-secret` header is missing or invalid.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-refresh-secret');
  const serverSecret = process.env.GITHUB_REFRESH_SECRET;
  
  if (!serverSecret) {
    console.error('[API Refresh] GITHUB_REFRESH_SECRET is not set – refusing to run refresh.');
    return NextResponse.json(
      { message: 'Server mis-configuration: secret missing.' },
      { status: 500 }
    );
  }
  
  if (secret !== serverSecret) {
    const generateKeyCommand = "node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"";
    console.warn(`[API Refresh] Unauthorized: 'x-refresh-secret' header invalid or missing.\n    Ensure GITHUB_REFRESH_SECRET (server) and NEXT_PUBLIC_GITHUB_REFRESH_SECRET (client) match.\n    To generate a new secret, run in terminal: ${generateKeyCommand}`);

    const exampleCurl = "curl -X POST -H 'Content-Type: application/json' -H 'x-refresh-secret: YOUR_ACTUAL_SECRET' http://localhost:3000/api/github-activity/refresh";

    return NextResponse.json({
      message: `Unauthorized. Refresh secret invalid or missing. Ensure 'x-refresh-secret' header is set correctly. Example: ${exampleCurl}. See server logs for more details.`,
      code: "UNAUTHORIZED_REFRESH_SECRET"
    }, { status: 401 });
  }

  console.log('[API Refresh] Received request to refresh GitHub activity data');

  try {
    const result = await refreshGitHubActivityDataFromApi();

    if (result) {
      console.log('[API Refresh] GitHub activity data refresh completed successfully');
      return NextResponse.json({
        message: 'GitHub activity data refresh completed successfully.',
        dataFetched: true,
        trailingYearCommits: result.trailingYearData.totalContributions,
        allTimeCommits: result.allTimeData.totalContributions
      }, { status: 200 });
    } else {
      console.warn('[API Refresh] GitHub activity data refresh process started but returned no data');
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
