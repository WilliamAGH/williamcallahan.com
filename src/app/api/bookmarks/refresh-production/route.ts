/**
 * @file API Route: Bookmarks Refresh for Production
 * @module app/api/bookmarks/refresh-production/route
 *
 * @description
 * This endpoint allows non-production environments to trigger a refresh
 * of bookmarks data in the production environment. It requires
 * authentication and only works from non-production environments.
 */

import { NextResponse } from "next/server";
import { envLogger } from "@/lib/utils/env-logger";
import { getErrorMessage } from "@/types/api-responses";
import { productionRefreshResponseSchema } from "@/types/schemas/api";

/**
 * POST handler for triggering production bookmarks refresh
 * Only available in non-production environments
 */
export async function POST(): Promise<NextResponse> {
  // Check if we're in a non-production environment
  const isProduction =
    process.env.DEPLOYMENT_ENV === "production" ||
    process.env.NEXT_PUBLIC_SITE_URL === "https://williamcallahan.com";

  if (isProduction) {
    envLogger.log(
      "Production refresh endpoint called from production environment - not allowed",
      undefined,
      {
        category: "BookmarksRefresh",
      },
    );
    return NextResponse.json(
      { message: "This endpoint is only available in non-production environments" },
      { status: 403 },
    );
  }

  // Get the production refresh secret
  const primarySecret = process.env.BOOKMARK_REFRESH_SECRET;
  let refreshSecret = primarySecret;

  if (!refreshSecret) {
    const cronSecret = process.env.BOOKMARK_CRON_REFRESH_SECRET;
    if (cronSecret) {
      refreshSecret = cronSecret;
      envLogger.log(
        "BOOKMARK_REFRESH_SECRET missing, falling back to BOOKMARK_CRON_REFRESH_SECRET",
        undefined,
        {
          category: "BookmarksRefresh",
        },
      );
    }
  }

  if (!refreshSecret) {
    envLogger.log(
      "BOOKMARK_REFRESH_SECRET not configured - cannot trigger production refresh",
      undefined,
      {
        category: "BookmarksRefresh",
      },
    );
    return NextResponse.json(
      { message: "Server configuration error: refresh secret not set" },
      { status: 500 },
    );
  }

  try {
    envLogger.log(
      "Triggering production bookmarks refresh from non-production environment",
      { sourceEnv: process.env.DEPLOYMENT_ENV || "development" },
      { category: "BookmarksRefresh" },
    );

    // Call the production refresh endpoint
    const productionUrl = "https://williamcallahan.com/api/bookmarks/refresh";

    const response = await fetch(productionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${refreshSecret}`,
      },
    });

    if (!response.ok) {
      const errorData: unknown = await response.json().catch(() => null);
      const errorMessage = getErrorMessage(errorData, response.statusText);

      envLogger.log(
        "Production bookmarks refresh request failed",
        {
          status: response.status,
          error: errorMessage,
        },
        { category: "BookmarksRefresh" },
      );

      return NextResponse.json(
        {
          message: "Failed to trigger production bookmarks refresh",
          error: errorMessage,
        },
        { status: response.status },
      );
    }

    const rawResult: unknown = await response.json();
    const parseResult = productionRefreshResponseSchema.safeParse(rawResult);

    if (!parseResult.success) {
      envLogger.log(
        "Production bookmarks refresh response validation failed",
        { errors: parseResult.error.format(), raw: rawResult },
        { category: "BookmarksRefresh" },
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

    envLogger.log(
      "Production bookmarks refresh triggered successfully",
      { result },
      { category: "BookmarksRefresh" },
    );

    return NextResponse.json({
      message: "Production bookmarks refresh initiated successfully",
      productionResponse: result,
    });
  } catch (error) {
    envLogger.log(
      "Error triggering production bookmarks refresh",
      { error: error instanceof Error ? error.message : String(error) },
      { category: "BookmarksRefresh" },
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
