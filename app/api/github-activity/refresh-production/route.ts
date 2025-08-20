/**
 * @file API Route: GitHub Activity Refresh for Production
 * @module app/api/github-activity/refresh-production/route
 * 
 * @description
 * This endpoint allows non-production environments to trigger a refresh
 * of GitHub activity data in the production environment. It requires
 * authentication and only works from non-production environments.
 */

import { NextResponse } from "next/server";
import { envLogger } from "@/lib/utils/env-logger";
import { getErrorMessage } from "@/types/api-responses";

/**
 * POST handler for triggering production GitHub activity refresh
 * Only available in non-production environments
 */
export async function POST(): Promise<NextResponse> {
  // Check if we're in a non-production environment
  const isProduction = process.env.DEPLOYMENT_ENV === "production" || 
                      process.env.NEXT_PUBLIC_SITE_URL === "https://williamcallahan.com";
  
  if (isProduction) {
    envLogger.log(
      "Production refresh endpoint called from production environment - not allowed",
      undefined,
      { category: "GitHubActivityRefresh" },
    );
    return NextResponse.json(
      { message: "This endpoint is only available in non-production environments" },
      { status: 403 },
    );
  }

  // Get the production refresh secret
  const refreshSecret = process.env.GITHUB_REFRESH_SECRET;
  
  if (!refreshSecret) {
    envLogger.log(
      "GITHUB_REFRESH_SECRET not configured - cannot trigger production refresh",
      undefined,
      { category: "GitHubActivityRefresh" },
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

    const result: unknown = await response.json();
    
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