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

import { NextResponse } from "next/server";
import { validateSearchQuery } from "@/lib/validators/search";
import { searchBookmarks } from "@/lib/search";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import type { UnifiedBookmark } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");

    // Sanitize / validate like other search routes
    const validation = validateSearchQuery(rawQuery);
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error || "Invalid search query" }, { status: 400 });
    }

    const query = validation.sanitized;
    if (query.length === 0) return NextResponse.json({ data: [], totalCount: 0, hasMore: false });

    // Validate pagination params with defaults
    const pageParam = searchParams.get("page");
    const limitParam = searchParams.get("limit");
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limit = limitParam ? parseInt(limitParam, 10) : 24;

    // Validate the parsed values
    if (Number.isNaN(page) || page < 1) {
      return NextResponse.json({ error: "Invalid page parameter" }, { status: 400 });
    }
    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json({ error: "Invalid limit parameter" }, { status: 400 });
    }

    // Get IDs of matching bookmarks via MiniSearch index
    const searchResults = await searchBookmarks(query);
    const matchingIds = new Set(searchResults.map(r => String(r.id)));

    // Pull full bookmark objects (includeImageData=false for lighter payload)
    const fullDataset = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: false,
      skipExternalFetch: false,
      force: false,
    })) as UnifiedBookmark[];
    const matched = fullDataset.filter(b => matchingIds.has(b.id));

    const totalCount = matched.length;
    const start = (page - 1) * limit;
    const paginated = matched.slice(start, start + limit);

    return NextResponse.json({
      data: paginated,
      totalCount,
      hasMore: start + limit < totalCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bookmarks Search API]", message);
    return NextResponse.json({ error: "Bookmarks search failed", details: message }, { status: 500 });
  }
}
