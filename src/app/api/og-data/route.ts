/**
 * OpenGraph Data API
 *
 * Returns OpenGraph metadata including profile and banner images
 * Used by social cards to fetch profile images with S3 persistence
 */

import { preventCaching, createErrorResponse } from "@/lib/utils/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import type { OgImageApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  preventCaching();
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const url = searchParams.get("url");

  if (!url) {
    return createErrorResponse("URL parameter is required", 400);
  }

  try {
    // Validate URL without side effects
    if (!URL.canParse(url)) throw new Error("invalid");
  } catch {
    return createErrorResponse("Invalid URL format", 400);
  }

  try {
    // Fetch OpenGraph data with caching and S3 persistence
    const ogData = await getOpenGraphData(url);

    if (!ogData) {
      return createErrorResponse("Failed to fetch OpenGraph data", 404);
    }

    // Return data in the format expected by SocialCardClient
    const response: OgImageApiResponse = {
      profileImageUrl: ogData.profileImageUrl || undefined,
      domainImageUrl: ogData.bannerImageUrl || ogData.imageUrl || undefined,
    };

    return NextResponse.json(response, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("[OG-Data API] Error fetching OpenGraph data:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
