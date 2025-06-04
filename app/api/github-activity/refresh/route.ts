/**
 * @file API Route: GitHub Activity Refresh
 * @module app/api/github-activity/refresh/route
 *
 * @description
 * This API route handles POST requests to refresh the GitHub activity data.
 * It's a protected endpoint that requires a secret key for authorization.
 * Upon successful validation, it triggers the data refresh process from the GitHub API,
 * updates the application's data store, and returns statistics about the fetched data.
 */

import { NextResponse } from 'next/server';
import { refreshGitHubActivityDataFromApi } from '@/lib/data-access/github';
import type { NextRequest } from 'next/server';

/**
 * @constant {string} dynamic - Ensures the route is dynamically rendered and not cached.
 * @default 'force-dynamic'
 */
export const dynamic = 'force-dynamic';

/**
 * Handles POST requests to refresh GitHub activity data.
 *
 * This function serves as the API endpoint for triggering a manual refresh of GitHub activity.
 * It performs the following steps:
 * 1. Validates an `x-refresh-secret` header against a server-configured secret.
 * 2. If validation fails, returns a 401 Unauthorized response.
 * 3. If the server secret is not configured, returns a 500 Server Error response.
 * 4. If validation succeeds, calls `refreshGitHubActivityDataFromApi` to fetch and process data.
 * 5. Returns a 200 OK response with commit statistics upon successful refresh.
 * 6. Returns a 500 Server Error response if the refresh process fails or returns no data.
 *
 * @param {NextRequest} request - The incoming Next.js API request object.
 * @returns {Promise<NextResponse>} A promise that resolves to a Next.js API response
 * indicating the outcome of the refresh operation.
 *
 * @throws {Error} Catches and logs any unexpected errors during the process, returning a 500 response.
 *
 * @remarks
 * - The `x-refresh-secret` header is crucial for protecting this endpoint.
 * - Server logs provide detailed information on failures or unauthorized attempts.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    const generateKeyCommand = "node -e \"import('crypto').then(crypto => console.log(crypto.randomBytes(32).toString('hex')))\"";
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
    }
    // Removed useless else: The previous if block returns early.
    console.warn('[API Refresh] GitHub activity data refresh process started but returned no data');
    return NextResponse.json({
      message: 'GitHub activity data refresh process initiated but may have failed or returned no data. Check server logs.',
      dataFetched: false,
    }, { status: 500 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('[API Refresh] Critical error during GitHub activity data refresh:', errorMessage);
    return NextResponse.json(
      { message: 'Failed to refresh GitHub activity data.', error: errorMessage },
      { status: 500 }
    );
  }
}
