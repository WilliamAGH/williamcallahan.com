/**
 * @file API Route: GitHub Activity Refresh for Production
 * @module app/api/github-activity/refresh-production/route
 *
 * @description
 * This endpoint allows non-production environments to trigger a refresh
 * of GitHub activity data in the production environment. It requires
 * authentication and only works from non-production environments.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { resolveDatabaseAccessMode } from "@/lib/db/connection";
import { isMissingClerkMiddlewareError } from "@/lib/utils/api-utils";
import { envLogger } from "@/lib/utils/env-logger";
import { getErrorMessage } from "@/types/api-responses";
import { githubActivityRefreshSuccessResponseSchema } from "@/types/schemas/github-storage";

/**
 * POST handler for triggering production GitHub activity refresh
 * Only available in non-production environments
 */
export async function POST(): Promise<NextResponse> {
  // Check if we're in a non-production environment
  const databaseAccess = resolveDatabaseAccessMode();
  if (databaseAccess.allowWrites) {
    envLogger.log(
      "Production refresh endpoint called from production environment - not allowed",
      { environment: databaseAccess.environment, source: databaseAccess.source },
      {
        category: "GitHubActivityRefresh",
      },
    );
    return NextResponse.json(
      { message: "This endpoint is only available in non-production environments" },
      { status: 403 },
    );
  }

  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (error) {
    if (!isMissingClerkMiddlewareError(error)) {
      throw error;
    }

    envLogger.log(
      "Clerk authentication unavailable; rejecting production refresh request",
      { error: error.message },
      { category: "GitHubActivityRefresh" },
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the production refresh secret
  const refreshSecret = process.env.GITHUB_REFRESH_SECRET;

  if (!refreshSecret) {
    envLogger.log(
      "GITHUB_REFRESH_SECRET not configured - cannot trigger production refresh",
      undefined,
      {
        category: "GitHubActivityRefresh",
      },
    );
    return NextResponse.json(
      { message: "Server configuration error: refresh secret not set" },
      { status: 500 },
    );
  }

  try {
    envLogger.log(
      "Triggering production GitHub activity refresh from non-production environment",
      { sourceEnv: process.env.DEPLOYMENT_ENV || "development" },
      { category: "GitHubActivityRefresh" },
    );

    // Call the production refresh endpoint
    const productionUrl = "https://williamcallahan.com/api/github-activity/refresh";

    const response = await fetch(productionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-refresh-secret": refreshSecret,
      },
    });

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => null);
      const errorMessage = getErrorMessage(errorData, response.statusText);

      envLogger.log(
        "Production refresh request failed",
        {
          status: response.status,
          error: errorMessage,
        },
        { category: "GitHubActivityRefresh" },
      );

      return NextResponse.json(
        {
          message: "Failed to trigger production refresh",
          error: errorMessage,
        },
        { status: response.status },
      );
    }

    let rawResult: unknown;
    try {
      rawResult = await response.json();
    } catch (error: unknown) {
      envLogger.log(
        "Production GitHub activity refresh returned invalid JSON",
        { error: error instanceof Error ? error.message : String(error) },
        { category: "GitHubActivityRefresh" },
      );
      return NextResponse.json(
        {
          message: "Production returned invalid response format",
          error: "Response validation failed",
        },
        { status: 502 },
      );
    }

    const parseResult = githubActivityRefreshSuccessResponseSchema.safeParse(rawResult);
    if (!parseResult.success) {
      envLogger.log(
        "Production GitHub activity refresh response validation failed",
        { errors: parseResult.error.format() },
        { category: "GitHubActivityRefresh" },
      );
      return NextResponse.json(
        {
          message: "Production returned invalid response format",
          error: "Response validation failed",
        },
        { status: 502 },
      );
    }

    const result = parseResult.data;
    if (!result.dataFetched) {
      envLogger.log(
        "Production GitHub activity refresh was rejected as read-only",
        { result },
        { category: "GitHubActivityRefresh" },
      );
      return NextResponse.json(
        {
          message: "Production did not perform the GitHub activity refresh",
          error: "Production deployment is read-only",
        },
        { status: 502 },
      );
    }

    envLogger.log(
      "Production refresh triggered successfully",
      { result },
      { category: "GitHubActivityRefresh" },
    );

    return NextResponse.json({
      message: "Production refresh initiated successfully",
      productionResponse: result,
    });
  } catch (error) {
    envLogger.log(
      "Error triggering production refresh",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "GitHubActivityRefresh" },
    );

    return NextResponse.json(
      {
        message: "Failed to connect to production environment",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
