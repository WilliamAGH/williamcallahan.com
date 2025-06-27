/**
 * Cache Clear API Route
 * @module app/api/cache/clear
 * @description
 * Server-side API endpoint for clearing server caches.
 * This is useful for development and testing.
 *
 * Extended with cache corruption detection and automatic recovery
 */

import { NextRequest, NextResponse } from "next/server";
import { invalidateBlogCache } from "@/lib/blog/mdx";
import { invalidateGitHubCache } from "@/lib/data-access/github";
import { invalidateOpenGraphCache } from "@/lib/data-access/opengraph";
import { invalidateLogoCache } from "@/lib/data-access/logos";
import { invalidateSearchCache } from "@/lib/search";
import { revalidateTag } from "next/cache";

/**
 * Validates API key for cache operations
 */
function validateApiKey(request: NextRequest): boolean {
  const apiKey = process.env.CACHE_API_KEY;
  if (!apiKey) {
    console.warn("[Cache API] CACHE_API_KEY not configured");
    return false;
  }

  const providedKey = request.headers.get("x-api-key");
  return providedKey === apiKey;
}

/**
 * @deprecated Cache corruption detection is no longer needed with Next.js cache
 * Next.js cache handles data integrity automatically
 */
function detectCacheCorruption() {
  return {
    totalEntries: 0,
    corruptedEntries: 0,
    emptyEntries: 0,
    invalidOpenGraphEntries: 0,
    oversizedEntries: 0,
    repaired: false,
    message: "Cache corruption detection is deprecated. Next.js cache handles data integrity."
  };
}

/**
 * GET - Cache health check (deprecated functionality)
 * @deprecated Cache health checks are no longer applicable with Next.js cache
 */
export function GET(request: NextRequest): NextResponse {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    status: "success",
    message: "Cache health check endpoint is deprecated",
    data: {
      cache: {
        message: "Next.js cache manages its own health and integrity"
      },
      imageMemory: {
        message: "Image memory caching has been removed - images served directly from S3/CDN"
      },
      corruption: detectCacheCorruption(),
      recommendations: [
        "This endpoint is deprecated",
        "Next.js cache handles data integrity automatically",
        "Images are served directly from S3/CDN without caching"
      ],
    },
  });
}

/**
 * POST - Clear all Next.js caches
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Invalidate all Next.js caches
    console.log("[Cache Clear] Starting Next.js cache invalidation...");
    
    // Clear specific cache tags
    const cacheTags = [
      "blog",
      "github",
      "opengraph",
      "logos", 
      "search",
      "bookmarks",
      "education",
      "experience",
      "investments"
    ];
    
    // Invalidate each cache tag
    for (const tag of cacheTags) {
      revalidateTag(tag);
      console.log(`[Cache Clear] Invalidated cache tag: ${tag}`);
    }
    
    // Call specific invalidation functions
    await Promise.all([
      invalidateBlogCache(),
      invalidateGitHubCache(),
      invalidateOpenGraphCache(),
      invalidateLogoCache(),
      invalidateSearchCache()
    ]);
    
    console.log("[Cache Clear] All Next.js caches invalidated successfully");

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    return NextResponse.json({
      status: "success",
      message: "All Next.js caches cleared successfully",
      data: {
        invalidatedTags: cacheTags,
        timestamp: new Date().toISOString(),
        notes: [
          "Next.js caches have been invalidated",
          "Image caching has been removed - images served directly from S3/CDN",
          "ServerCache is deprecated and will be removed"
        ]
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Cache Clear] Failed to clear caches:", errorMessage);
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to clear Next.js caches",
        error: errorMessage,
      },
      { status: 500 },
    );
  }
}
