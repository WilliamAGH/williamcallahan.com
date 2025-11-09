/**
 * Debug endpoint for GitHub activity data
 *
 * @deprecated This endpoint's cache debugging functionality has been removed.
 * GitHub activity now uses Next.js cache which doesn't expose debug info.
 * Consider fetching activity data directly using the main API endpoint.
 */

import { NextResponse } from "next/server";

/**
 * GET /api/github-activity/debug
 * @description Returns deprecation notice. Cache debug info is no longer available.
 * @deprecated Use the main /api/github-activity endpoint instead
 * @returns {NextResponse}
 */
export function GET(): NextResponse {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "This endpoint is only available in development mode." }, { status: 403 });
  }

  return NextResponse.json({
    message: "GitHub activity cache debug endpoint is deprecated.",
    cache: {
      message: "Cache debug info is no longer available with Next.js cache",
      notes: [
        "GitHub activity now uses Next.js cache directives",
        "ServerCache has been deprecated",
        "Use /api/github-activity endpoint to fetch current data",
      ],
    },
  });
}
