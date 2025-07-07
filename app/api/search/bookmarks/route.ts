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
import type { UnifiedBookmark } from "@/types";
import { BookmarkSearchParamsSchema } from "@/types/schemas/search";

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

    // Validate pagination params
    const paginationValidation = BookmarkSearchParamsSchema.pick({ page: true, limit: true }).safeParse({
      page: searchParams.get("page"),
      limit: searchParams.get("limit"),
    });

    if (!paginationValidation.success) {
      return NextResponse.json({ error: "Invalid pagination parameters" }, { status: 400 });
    }

    const { page, limit } = paginationValidation.data;

    // Get IDs of matching bookmarks via MiniSearch index
    const searchResults = await searchBookmarks(query);
    const matchingIds = new Set(searchResults.map((r) => String(r.id)));

    // Pull full bookmark objects (includeImageData=false for lighter payload)
    const fullDataset = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
    const matched = fullDataset.filter((b) => matchingIds.has(b.id));

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
