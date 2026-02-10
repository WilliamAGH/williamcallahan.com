import { envLogger } from "@/lib/utils/env-logger";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cache invalidation endpoint for books
 * Called by the scheduler after successful books dataset regeneration
 * to ensure Next.js serves fresh data from the updated S3 snapshot.
 */
export function POST(request: NextRequest): NextResponse {
  console.log(
    `[Cache Invalidation] Books revalidation endpoint called at ${new Date().toISOString()}`,
  );

  // Verify authorization (reuses BOOKMARK_CRON_REFRESH_SECRET — no new env var needed)
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.BOOKMARK_CRON_REFRESH_SECRET;

  if (!expectedToken) {
    console.error("[Cache Invalidation] BOOKMARK_CRON_REFRESH_SECRET not configured");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  const presentedToken = (() => {
    const h = authHeader ?? "";
    const match = h.match(/^\s*Bearer\s+(.+?)\s*$/i);
    return match?.[1]?.trim() ?? "";
  })();

  if (presentedToken !== expectedToken) {
    envLogger.log("Unauthorized books revalidation attempt", undefined, {
      category: "CacheInvalidation",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cache Invalidation] Revalidating book paths...");

    // Main books grid page
    revalidatePath("/books");

    // Individual book detail pages (dynamic route)
    revalidatePath("/books/[book-slug]", "page");

    // Invalidate the books dataset cache tag used by books-data-access.server.ts
    revalidateTag("books-dataset", "max");

    console.log("[Cache Invalidation] ✅ Successfully invalidated all book caches");

    return NextResponse.json(
      {
        success: true,
        message: "Book caches invalidated successfully",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Cache Invalidation] Error during book revalidation:", errorMessage);
    return NextResponse.json(
      {
        error: "Cache invalidation failed",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}

export function GET() {
  return NextResponse.json(
    {
      status: "ready",
      endpoint: "/api/revalidate/books",
      method: "POST",
      authentication: "Bearer token required",
    },
    { status: 200 },
  );
}
