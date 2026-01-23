/**
 * Bookmarks-only Search API Route
 *
 * GET /api/search/bookmarks?q=<query>
 * Returns `{ data: UnifiedBookmark[] }` so existing client code can reuse the
 * same parsing logic used for the bulk-fetch endpoint. It relies on the
 * server-side `searchBookmarks` MiniSearch index to find matching bookmark IDs
 * and then hydrates them to full `UnifiedBookmark` objects via
 * `getBookmarks()`.
 */

import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { searchBookmarks } from "@/lib/search";
import { applySearchGuards, createSearchErrorResponse, withNoStoreHeaders } from "@/lib/search/api-guards";
import { validateSearchQuery } from "@/lib/validators/search";
import type { UnifiedBookmark } from "@/types";
import { unstable_noStore as noStore } from "next/cache";
import { NextResponse, connection, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

function resolveRequestUrl(request: NextRequest | { nextUrl?: URL; url: string }): URL {
  if ("nextUrl" in request && request.nextUrl instanceof URL) {
    return request.nextUrl;
  }
  return new URL(request.url);
}

export async function GET(request: NextRequest) {
  // connection(): ensure request-time execution under cacheComponents to avoid prerendered buildPhase responses
  await connection();
  // CRITICAL: Call noStore() FIRST to prevent Next.js from caching ANY response
  // If called after the build phase check, the buildPhase:true response gets cached
  if (typeof noStore === "function") {
    noStore();
  }
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      { data: [], totalCount: 0, hasMore: false, buildPhase: true },
      { headers: withNoStoreHeaders() },
    );
  }
  try {
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q");

    // Apply rate limiting and memory pressure guards
    const guardResponse = applySearchGuards(request);
    if (guardResponse) return guardResponse;

    // Sanitize / validate like other search routes
    const validation = validateSearchQuery(rawQuery);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }

    const query = validation.sanitized;
    if (query.length === 0)
      return NextResponse.json({ data: [], totalCount: 0, hasMore: false }, { headers: withNoStoreHeaders() });

    // Validate pagination params with defaults
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 24;

    // Validate the parsed values
    if (Number.isNaN(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page parameter" }, { status: 400, headers: withNoStoreHeaders() });
    }
    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Invalid limit parameter" }, { status: 400, headers: withNoStoreHeaders() });
    }

    // Get IDs of matching bookmarks via MiniSearch index (already score-sorted)
    const searchResults = await searchBookmarks(query);

    // Pull full bookmark objects (includeImageData=false for lighter payload)
    const fullDataset = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: false,
      skipExternalFetch: false,
      force: false,
    })) as UnifiedBookmark[];
    const bookmarksById = new Map(fullDataset.map(bookmark => [bookmark.id, bookmark]));
    const orderedMatches = searchResults
      .map(result => bookmarksById.get(String(result.id)))
      .filter((bookmark): bookmark is UnifiedBookmark => Boolean(bookmark));

    const totalCount = orderedMatches.length;
    const start = (page - 1) * limit;
    const paginated = orderedMatches.slice(start, start + limit);

    return NextResponse.json(
      {
        data: paginated,
        totalCount,
        hasMore: start + limit < totalCount,
      },
      { headers: withNoStoreHeaders() },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bookmarks Search API]", message);
    return createSearchErrorResponse("Bookmarks search failed", message);
  }
}
