/**
 * GitHub Activity API Endpoint
 *
 * Provides client-side access to GitHub activity data from S3 storage
 * Handles error cases with consistent response structure
 *
 * @module app/api/github-activity
 *
 * Query Parameters:
 *   - refresh=true: Deprecated, returns guidance to use POST /api/github-activity/refresh
 *   - force-cache=true: Effectively ignored as data-access layer handles caching
 */

import { getGithubActivityCached } from "@/lib/data-access/github-public-api";
import { preventCaching } from "@/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Handles GET requests for the GitHub Activity API endpoint, returning pre-processed GitHub activity data.
 *
 * If the deprecated `refresh=true` query parameter is present, responds with a 400 error and guidance to use the POST refresh endpoint instead. On success, returns a `UserActivityView` object containing GitHub activity data. On error, returns a 500 response with a consistent JSON structure indicating failure and empty data.
 *
 * @returns A JSON response containing GitHub activity data or an error structure
 */
export async function GET(request: NextRequest) {
  console.log("[API GET /github-activity] Received request.");
  preventCaching();

  // The 'refresh' and 'force-cache' query params are no longer used by this GET endpoint
  // as getGithubActivity is now S3-read-only and refresh is handled by POST /api/github-activity/refresh
  const url = new URL(request.url);
  const refreshParam = url.searchParams.get("refresh");
  if (refreshParam === "true") {
    console.warn(
      "[API GET /github-activity] 'refresh=true' param is deprecated for GET. Use POST /api/github-activity/refresh to update data.",
    );
    return NextResponse.json(
      {
        error: "The 'refresh=true' query parameter is deprecated for GET requests.",
        message:
          "To refresh GitHub activity data, please use the POST endpoint: /api/github-activity/refresh.",
      },
      { status: 400 },
    );
  }

  try {
    const activityData = await getGithubActivityCached();

    // The getGithubActivity function is designed to always return a UserActivityView object,
    // even in error or empty states (indicated by activityData.source and activityData.error fields).
    // Therefore, a separate 'else' case for a falsy activityData is not necessary.
    return NextResponse.json(activityData);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("[API GET /github-activity] Error fetching GitHub activity data:", errorMessage);

    // Return UserActivityView-compatible error structure to prevent client crashes
    // The client expects trailingYearData.data, allTimeStats, etc. - not a simple { error } object
    const errorView = {
      source: "error" as const,
      error: "Failed to retrieve GitHub activity data.",
      trailingYearData: {
        data: [],
        totalContributions: 0,
        dataComplete: false,
      },
      allTimeStats: {
        totalContributions: 0,
        linesAdded: 0,
        linesRemoved: 0,
      },
    };
    return NextResponse.json(errorView, { status: 500 });
  }
}
