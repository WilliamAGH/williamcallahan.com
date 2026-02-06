/**
 * Bookmarks-only Search API Route
 *
 * GET /api/search/bookmarks?q=<query>
 * Returns dual payload shapes for compatibility:
 * - `data`: hydrated `UnifiedBookmark[]` for bookmark-focused consumers
 * - `results`: normalized `SearchResult[]` for terminal scoped-search parsing
 *
 * It relies on the server-side `searchBookmarks` MiniSearch index to find
 * matching bookmark IDs and then hydrates them to full `UnifiedBookmark`
 * objects via `getBookmarks()`.
 */

import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { searchBookmarks } from "@/lib/search";
import {
  applySearchGuards,
  createSearchErrorResponse,
  withNoStoreHeaders,
} from "@/lib/search/api-guards";
import { validateSearchQuery } from "@/lib/validators/search";
import type { UnifiedBookmark } from "@/types";
import type { SearchResult } from "@/types/search";
import { bookmarkSearchParamsSchema } from "@/types/schemas/search";
import { preventCaching } from "@/lib/utils/api-utils";
import { debug } from "@/lib/utils/debug";
import { NextResponse, connection, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

/** Pagination-only slice of the bookmark search params schema. */
const paginationSchema = bookmarkSearchParamsSchema.pick({ page: true, limit: true });

/** Build the standard bookmark search response payload. */
function buildBookmarkSearchResponse(params: {
  data: UnifiedBookmark[];
  results: SearchResult[];
  totalCount: number;
  hasMore: boolean;
  query: string;
  extra?: Record<string, unknown>;
}): NextResponse {
  const { data, results, totalCount, hasMore, query, extra } = params;
  return NextResponse.json(
    {
      data,
      results,
      totalCount,
      hasMore,
      ...extra,
      meta: {
        query,
        scope: "bookmarks",
        count: results.length,
        timestamp: new Date().toISOString(),
        ...extra,
      },
    },
    { headers: withNoStoreHeaders() },
  );
}

function resolveRequestUrl(request: NextRequest | { nextUrl?: URL; url: string }): URL {
  if ("nextUrl" in request && request.nextUrl instanceof URL) {
    return request.nextUrl;
  }
  return new URL(request.url);
}

export async function GET(request: NextRequest) {
  // connection(): ensure request-time execution under cacheComponents to avoid prerendered buildPhase responses
  await connection();
  // CRITICAL: Call preventCaching() FIRST to prevent Next.js from caching ANY response
  // If called after the build phase check, the buildPhase:true response gets cached
  preventCaching();
  if (isProductionBuildPhase()) {
    return buildBookmarkSearchResponse({
      data: [],
      results: [],
      totalCount: 0,
      hasMore: false,
      query: "",
      extra: { buildPhase: true },
    });
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
    if (query.length === 0) {
      return buildBookmarkSearchResponse({
        data: [],
        results: [],
        totalCount: 0,
        hasMore: false,
        query,
      });
    }

    // Validate pagination via the canonical Zod schema (coerces, bounds-checks, defaults)
    const paginationInput = {
      ...(searchParams.get("page") != null && { page: searchParams.get("page") }),
      ...(searchParams.get("limit") != null && { limit: searchParams.get("limit") }),
    };
    const paginationResult = paginationSchema.safeParse(paginationInput);
    if (!paginationResult.success) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }
    const { page, limit } = paginationResult.data;

    // Get IDs of matching bookmarks via MiniSearch index (already score-sorted)
    const searchResults = await searchBookmarks(query);

    // Pull full bookmark objects (includeImageData=false for lighter payload)
    const fullDataset = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: false,
      skipExternalFetch: false,
      force: false,
    })) as UnifiedBookmark[];
    const bookmarksById = new Map(fullDataset.map((bookmark) => [bookmark.id, bookmark]));
    const orderedMatches = searchResults
      .map((result) => bookmarksById.get(String(result.id)))
      .filter((bookmark): bookmark is UnifiedBookmark => Boolean(bookmark));

    const totalCount = orderedMatches.length;
    const start = (page - 1) * limit;
    const paginated = orderedMatches.slice(start, start + limit);
    const searchResultsById = new Map(searchResults.map((result) => [String(result.id), result]));
    const paginatedResults: SearchResult[] = paginated.map((bookmark) => {
      const ranked = searchResultsById.get(bookmark.id);
      if (!ranked) {
        debug("[Bookmarks Search] No ranked result for hydrated bookmark:", bookmark.id);
      }
      const bookmarkUrl = bookmark.slug
        ? `/bookmarks/${bookmark.slug}`
        : `/bookmarks/${bookmark.id}`;
      return {
        id: bookmark.id,
        type: "bookmark",
        title: bookmark.title,
        description: bookmark.description,
        url: ranked?.url ?? bookmarkUrl,
        score: ranked?.score ?? 0,
      };
    });

    return buildBookmarkSearchResponse({
      data: paginated,
      results: paginatedResults,
      totalCount,
      hasMore: start + limit < totalCount,
      query,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bookmarks Search API]", message);
    return createSearchErrorResponse("Bookmarks search failed", message);
  }
}
