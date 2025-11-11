/**
 * OpenGraph Data API
 *
 * Returns OpenGraph metadata including profile and banner images
 * Used by social cards to fetch profile images with S3 persistence
 */

import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getOpenGraphData } from "@/lib/data-access/opengraph";
import type { OgImageApiResponse } from "@/types";

export async function GET(request: NextRequest) {
  if (typeof noStore === "function") {
    noStore();
  }
  const requestUrl = new URL(request.url);
  const { searchParams } = requestUrl;
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  try {
    // Validate URL without side effects
    if (!URL.canParse(url)) throw new Error("invalid");
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  try {
    // Fetch OpenGraph data with caching and S3 persistence
    const ogData = await getOpenGraphData(url);

    if (!ogData) {
      return NextResponse.json({ error: "Failed to fetch OpenGraph data" }, { status: 404 });
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
