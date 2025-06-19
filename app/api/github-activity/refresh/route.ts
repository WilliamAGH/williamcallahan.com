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

import { refreshGitHubActivityDataFromApi } from "@/lib/data-access/github";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * @constant {string} dynamic - Ensures the route is dynamically rendered and not cached.
 * @default 'force-dynamic'
 */
export const dynamic = "force-dynamic";

// Simple in-memory rate limiting
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per hour per IP

// Clean up expired entries every 5 minutes – unref so it doesn't hold the Node event-loop open in tests
const cleanupInterval = setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap.entries()) {
      if (entry.resetTime < now) {
        rateLimitMap.delete(key);
      }
    }
  },
  5 * 60 * 1000,
);
cleanupInterval.unref();

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
  // Skip during build phase to prevent blocking
  if (process.env.NEXT_PHASE === "phase-production-build") {
    console.log("[API Refresh] Build phase detected - skipping GitHub activity refresh");
    return NextResponse.json({ message: "Skipping refresh during build phase", buildPhase: true }, { status: 200 });
  }

  // Check for cron job authentication first
  const authorizationHeader = request.headers.get("Authorization");
  const cronRefreshSecret = process.env.GITHUB_CRON_REFRESH_SECRET || process.env.BOOKMARK_CRON_REFRESH_SECRET;
  let isCronJob = false;

  if (cronRefreshSecret && authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
    const token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    if (token === cronRefreshSecret) {
      isCronJob = true;
      console.log("[API Refresh] Authenticated as cron job via GITHUB_CRON_REFRESH_SECRET.");
    }
  }

  let rateLimitEntry: { count: number; resetTime: number } | undefined;

  // Only apply rate limiting if not a cron job
  if (!isCronJob) {
    // Extract IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0] || realIp || "unknown";
    const rateLimitKey = `github-refresh:${ip}`;

    // Check rate limit
    const now = Date.now();
    rateLimitEntry = rateLimitMap.get(rateLimitKey);

    if (!rateLimitEntry || rateLimitEntry.resetTime < now) {
      // Create new entry
      rateLimitEntry = {
        count: 0,
        resetTime: now + RATE_LIMIT_WINDOW,
      };
      rateLimitMap.set(rateLimitKey, rateLimitEntry);
    }

    // Increment request count
    rateLimitEntry.count++;

    // Check if rate limit exceeded
    if (rateLimitEntry.count > RATE_LIMIT_MAX_REQUESTS) {
      const resetDate = new Date(rateLimitEntry.resetTime);
      console.warn(
        `[API Refresh] Rate limit exceeded for IP ${ip}. Count: ${rateLimitEntry.count}, Limit: ${RATE_LIMIT_MAX_REQUESTS}`,
      );

      return NextResponse.json(
        {
          message: "Rate limit exceeded. Please try again later.",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: resetDate.toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": Math.floor(rateLimitEntry.resetTime / 1000).toString(),
            "Retry-After": Math.ceil((rateLimitEntry.resetTime - now) / 1000).toString(),
          },
        },
      );
    }
  }

  // Skip x-refresh-secret check if authenticated as cron job
  if (!isCronJob) {
    const secret = request.headers.get("x-refresh-secret");
    const serverSecret = process.env.GITHUB_REFRESH_SECRET;

    if (!serverSecret) {
      console.error("[API Refresh] GITHUB_REFRESH_SECRET is not set – refusing to run refresh.");
      return NextResponse.json({ message: "Server mis-configuration: secret missing." }, { status: 500 });
    }

    if (secret !== serverSecret) {
      const generateKeyCommand =
        "node -e \"import('crypto').then(crypto => console.log(crypto.randomBytes(32).toString('hex')))\"";
      console.warn(
        `[API Refresh] Unauthorized: 'x-refresh-secret' header invalid or missing.\n    Ensure GITHUB_REFRESH_SECRET is set on the server.\n    To generate a new secret, run in terminal: ${generateKeyCommand}`,
      );

      const exampleCurl =
        "curl -X POST -H 'Content-Type: application/json' -H 'x-refresh-secret: YOUR_ACTUAL_SECRET' http://localhost:3000/api/github-activity/refresh";

      return NextResponse.json(
        {
          message: `Unauthorized. Refresh secret invalid or missing. Ensure 'x-refresh-secret' header is set correctly. Example: ${exampleCurl}. See server logs for more details.`,
          code: "UNAUTHORIZED_REFRESH_SECRET",
        },
        { status: 401 },
      );
    }
  }

  console.log("[API Refresh] Received request to refresh GitHub activity data");

  try {
    const result = await refreshGitHubActivityDataFromApi();

    if (result) {
      console.log("[API Refresh] GitHub activity data refresh completed successfully");

      const responseData = {
        message: `GitHub activity data refresh completed successfully${isCronJob ? " (triggered by cron job)" : ""}.`,
        dataFetched: true,
        trailingYearCommits: result.trailingYearData.totalContributions,
        allTimeCommits: result.allTimeData.totalContributions,
      };

      // Only add rate limit headers for non-cron requests
      if (!isCronJob && rateLimitEntry) {
        const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - rateLimitEntry.count);

        return NextResponse.json(responseData, {
          status: 200,
          headers: {
            "X-RateLimit-Limit": RATE_LIMIT_MAX_REQUESTS.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": Math.floor(rateLimitEntry.resetTime / 1000).toString(),
          },
        });
      }

      return NextResponse.json(responseData, { status: 200 });
    }
    // Removed useless else: The previous if block returns early.
    console.warn("[API Refresh] GitHub activity data refresh process started but returned no data");
    return NextResponse.json(
      {
        message:
          "GitHub activity data refresh process initiated but may have failed or returned no data. Check server logs.",
        dataFetched: false,
      },
      { status: 500 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("[API Refresh] Critical error during GitHub activity data refresh:", errorMessage);
    return NextResponse.json(
      { message: "Failed to refresh GitHub activity data.", error: errorMessage },
      { status: 500 },
    );
  }
}
