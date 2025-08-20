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

import { refreshGitHubActivityDataFromApi, invalidateGitHubCache } from "@/lib/data-access/github";
import { TIME_CONSTANTS } from "@/lib/constants";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";
import { incrementAndPersist, loadRateLimitStoreFromS3 } from "@/lib/rate-limiter";
import { envLogger } from "@/lib/utils/env-logger";

/**
 * @constant {string} dynamic - Ensures the route is dynamically rendered and not cached.
 * @default 'force-dynamic'
 */
export const dynamic = "force-dynamic";

// Rate limiting configuration
const RATE_LIMIT_WINDOW = TIME_CONSTANTS.RATE_LIMIT_WINDOW_MS;
const RATE_LIMIT_MAX_REQUESTS = 5; // 5 requests per hour per IP
const RATE_LIMIT_S3_PATH = "json/rate-limits/github-refresh.json";
const RATE_LIMIT_STORE_NAME = "github-refresh";

// Load rate limits from S3 on startup
let rateLimitsLoaded = false;
async function ensureRateLimitsLoaded() {
  if (!rateLimitsLoaded) {
    try {
      await loadRateLimitStoreFromS3(RATE_LIMIT_STORE_NAME, RATE_LIMIT_S3_PATH);
      rateLimitsLoaded = true;
    } catch (error) {
      console.warn("[API Refresh] Failed to load rate limits from S3:", error);
      // Continue anyway - will start with empty store
    }
  }
}

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

  // Ensure rate limits are loaded from S3
  await ensureRateLimitsLoaded();

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

  // Only apply rate limiting if not a cron job
  if (!isCronJob) {
    // Extract IP for rate limiting
    const forwarded = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = forwarded?.split(",")[0] || realIp || "unknown";
    const rateLimitKey = `github-refresh:${ip}`;

    // Check and increment rate limit using S3-backed persistent storage
    const allowed = incrementAndPersist(
      RATE_LIMIT_STORE_NAME,
      rateLimitKey,
      { maxRequests: RATE_LIMIT_MAX_REQUESTS, windowMs: RATE_LIMIT_WINDOW },
      RATE_LIMIT_S3_PATH,
    );

    if (!allowed) {
      const resetTime = Date.now() + RATE_LIMIT_WINDOW;
      const resetDate = new Date(resetTime);
      console.warn(`[API Refresh] Rate limit exceeded for IP ${ip}. Limit: ${RATE_LIMIT_MAX_REQUESTS} per hour`);

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
            "X-RateLimit-Reset": Math.floor(resetTime / 1000).toString(),
            "Retry-After": Math.ceil(RATE_LIMIT_WINDOW / 1000).toString(),
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

      // Invalidate cache layers for GitHub data
      invalidateGitHubCache(); // in-memory
      try {
        revalidateTag("github-activity"); // Next.js function cache tag
      } catch (err) {
        // No-op outside of Next request context
        envLogger.log(
          "revalidateTag('github-activity') skipped or failed",
          { error: err instanceof Error ? err.message : String(err) },
          { category: "GitHubActivityRefresh" },
        );
      }

      const responseData = {
        message: `GitHub activity data refresh completed successfully${isCronJob ? " (triggered by cron job)" : ""}.`,
        dataFetched: true,
        trailingYearCommits: result.trailingYearData.totalContributions,
        allTimeCommits: result.allTimeData.totalContributions,
      };

      // For successful non-cron requests, headers are already set by the allowed path
      // No need to add rate limit headers here as we don't have access to the exact count

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
