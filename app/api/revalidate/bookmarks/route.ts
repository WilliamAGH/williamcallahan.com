import { envLogger } from "@/lib/utils/env-logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cache invalidation endpoint for bookmarks
 * Called by the scheduler after successful bookmark refresh to ensure fresh data is served
 */
export function POST(request: NextRequest): NextResponse {
  console.log(`[Cache Invalidation] Bookmarks revalidation endpoint called at ${new Date().toISOString()}`);

  // Verify authorization
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.BOOKMARK_CRON_REFRESH_SECRET;

  if (!expectedToken) {
    console.error("[Cache Invalidation] BOOKMARK_CRON_REFRESH_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // Parse Bearer token robustly (case-insensitive scheme, tolerant to whitespace)
  const presentedToken = (() => {
    const h = authHeader ?? "";
    const match = h.match(/^\s*Bearer\s+(.+?)\s*$/i);
    return match?.[1]?.trim() ?? "";
  })();

  if (presentedToken !== expectedToken) {
    envLogger.log("Unauthorized revalidation attempt", undefined, { category: "CacheInvalidation" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Revalidate all bookmark-related paths
    console.log("[Cache Invalidation] Revalidating bookmark paths...");

    // Main bookmarks page
    revalidatePath("/bookmarks");

    // Individual bookmark pages (dynamic route)
    revalidatePath("/bookmarks/[slug]", "page");

    // Paginated bookmark pages
    revalidatePath("/bookmarks/page/[pageNumber]", "page");

    // Domain-filtered bookmark pages
    revalidatePath("/bookmarks/domain/[domainSlug]", "page");

    // Tag-based revalidation for all bookmark-related content
    revalidateTag("bookmarks", "default");
    // Ensure the function-level full dataset cache is also invalidated
    // This tag is used by fetchAndCacheBookmarks() when loading the S3 dataset
    revalidateTag("bookmarks-s3-full", "default");
    // Invalidate index-specific cache when present
    revalidateTag("bookmarks-index", "default");

    console.log("[Cache Invalidation] ✅ Successfully invalidated all bookmark caches");

    return NextResponse.json(
      {
        success: true,
        message: "Cache invalidated successfully",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Cache Invalidation] Error during revalidation:", errorMessage);
    return NextResponse.json(
      {
        error: "Cache invalidation failed",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}

// Health check endpoint
export function GET() {
  return NextResponse.json(
    {
      status: "ready",
      endpoint: "/api/revalidate/bookmarks",
      method: "POST",
      authentication: "Bearer token required",
    },
    { status: 200 },
  );
}
