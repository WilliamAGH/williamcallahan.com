/**
 * Cache Clear API Route
 * @module app/api/cache/clear
 * @description Server-side API endpoint for clearing Next.js caches.
 * Useful for development, testing, and manual cache invalidation.
 */

import { NextRequest, NextResponse } from "next/server";
import { invalidateBlogCache } from "@/lib/blog/mdx";
import { clearBlogSlugMemos } from "@/lib/blog";
import { invalidateOpenGraphCache } from "@/lib/data-access/opengraph";
import { invalidateLogoCache } from "@/lib/data-access/logos";
import { invalidateSearchCache } from "@/lib/search";
import { revalidateTag } from "next/cache";
import { GITHUB_CACHE_TAGS, invalidateAllGitHubCaches } from "@/lib/cache/invalidation";

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
 * POST - Clear all Next.js caches
 */
export function POST(request: NextRequest): NextResponse {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Invalidate all Next.js caches
    console.log("[Cache Clear] Starting Next.js cache invalidation...");

    // Clear specific cache tags
    const cacheTags = [
      "blog",
      GITHUB_CACHE_TAGS.PRIMARY,
      GITHUB_CACHE_TAGS.MAIN,
      "opengraph",
      "logos",
      "search",
      "bookmarks",
      "education",
      "experience",
      "investments",
    ];

    // Invalidate each cache tag
    for (const tag of cacheTags) {
      revalidateTag(tag, "max");
      console.log(`[Cache Clear] Invalidated cache tag: ${tag}`);
    }

    // Call specific invalidation functions
    const cacheInvalidators: Array<() => void> = [
      () => invalidateBlogCache(),
      () => clearBlogSlugMemos(),
      () => invalidateAllGitHubCaches(),
      () => invalidateOpenGraphCache(),
      () => invalidateLogoCache(),
      () => invalidateSearchCache(),
    ];

    for (const invalidate of cacheInvalidators) {
      invalidate();
    }

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
