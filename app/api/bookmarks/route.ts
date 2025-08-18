/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to bookmarks with pagination support.
 */

import { BookmarksIndexSchema } from "@/lib/schemas/bookmarks";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { BookmarksIndex } from "@/types/bookmark";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import { type NextRequest, NextResponse } from "next/server";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";

// This route can leverage the caching within getBookmarks
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log("[API Bookmarks] Received GET request for bookmarks");

  const searchParams = request.nextUrl.searchParams;
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);

  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

  // Get tag filter parameter
  const tagFilter = searchParams.get("tag") || null;

  try {
    // Fast-path: only when the caller requests **one standard page** worth of data
    // If the client asks for more than BOOKMARKS_PER_PAGE (24) items we must
    // fall back to the full-dataset path otherwise search on the bookmarks page
    // will miss results that live beyond page 1.
    if (!tagFilter && page > 0 && limit <= BOOKMARKS_PER_PAGE) {
      const { getBookmarksPage } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const rawIndex: unknown = await import("@/lib/s3-utils").then((m) =>
        m.readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX),
      );

      const indexResult = BookmarksIndexSchema.safeParse(rawIndex);

      if (indexResult.success) {
        const indexData = indexResult.data;
        const { totalPages, count: total, lastFetchedAt = Date.now() } = indexData;

        if (page <= totalPages) {
          // Load just the requested page
          const paginatedBookmarks = await getBookmarksPage(page);
          console.log(`[API Bookmarks] Loaded page ${page} directly (${paginatedBookmarks.length} items)`);

          // CRITICAL: Generate slug mappings for fast-path too
          const slugMapping = await loadSlugMapping();
          const internalHrefs: Record<string, string> = {};
          
          if (slugMapping) {
            for (const bookmark of paginatedBookmarks) {
              const slug = getSlugForBookmark(slugMapping, bookmark.id);
              if (slug) {
                internalHrefs[bookmark.id] = `/bookmarks/${slug}`;
              } else {
                console.error(`[API Bookmarks] WARNING: No slug for bookmark ${bookmark.id} (fast-path)`);
              }
            }
          } else {
            console.error("[API Bookmarks] CRITICAL: No slug mapping available in fast-path - URLs will cause 404s!");
          }

          return NextResponse.json(
            {
              data: paginatedBookmarks,
              internalHrefs, // Include slug mappings for URL generation
              meta: {
                pagination: {
                  page,
                  limit,
                  total,
                  totalPages,
                  hasNext: page < totalPages,
                  hasPrev: page > 1,
                },
                dataVersion: lastFetchedAt,
                lastRefreshed: new Date(lastFetchedAt).toISOString(),
              },
            },
            {
              headers: {
                "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
              },
            },
          );
        }
      }
    }

    // Fall back to loading all bookmarks for filtering or if paginated format not available
    const allBookmarks = await getBookmarks();

    // Try to get metadata from S3 index
    let lastFetchedAt = Date.now();
    try {
      const rawIndex: unknown = await import("@/lib/s3-utils").then((m) =>
        m.readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX),
      );
      const indexResult = BookmarksIndexSchema.safeParse(rawIndex);
      if (indexResult.success) {
        const indexData = indexResult.data;
        lastFetchedAt = indexData.lastFetchedAt;
      }
    } catch {
      // Use default if index read fails
    }

    // Apply tag filter if provided
    let filteredBookmarks = allBookmarks;
    if (tagFilter) {
      // Decode the tag filter (handle URL encoding and slug format)
      const decodedTag = decodeURIComponent(tagFilter);

      // Check if this is a slug format (contains hyphens) or display format
      const isSlugFormat = decodedTag.includes("-");
      const tagQuery = isSlugFormat ? decodedTag.replace(/-/g, " ") : decodedTag;

      filteredBookmarks = allBookmarks.filter((bookmark) => {
        const tags = normalizeTagsToStrings(bookmark.tags);
        // Case-insensitive tag matching against both slug and display formats
        return tags.some((tag) => {
          // Compare against the normalized query
          return tag.toLowerCase() === tagQuery.toLowerCase();
        });
      });

      console.log(
        `[API Bookmarks] Filtering by tag "${decodedTag}" (normalized: "${tagQuery}"): ${filteredBookmarks.length} of ${allBookmarks.length} bookmarks match`,
      );
    }

    // Calculate pagination on filtered results
    const offset = (page - 1) * limit;
    const paginatedBookmarks = filteredBookmarks.slice(offset, offset + limit);
    const totalPages = Math.ceil(filteredBookmarks.length / limit);

    // CRITICAL: Generate slug mappings for all bookmarks being returned
    // Without these, the client cannot generate valid URLs and will get 404s
    const slugMapping = await loadSlugMapping();
    const internalHrefs: Record<string, string> = {};
    
    if (slugMapping) {
      for (const bookmark of paginatedBookmarks) {
        const slug = getSlugForBookmark(slugMapping, bookmark.id);
        if (slug) {
          internalHrefs[bookmark.id] = `/bookmarks/${slug}`;
        } else {
          console.error(`[API Bookmarks] WARNING: No slug for bookmark ${bookmark.id}`);
        }
      }
    } else {
      console.error("[API Bookmarks] CRITICAL: No slug mapping available - URLs will cause 404s!");
    }

    console.log(
      `[API Bookmarks] Returning page ${page}/${totalPages} with ${paginatedBookmarks.length} bookmarks${tagFilter ? ` (filtered by tag: ${tagFilter})` : ""}`,
    );

    return NextResponse.json(
      {
        data: paginatedBookmarks,
        internalHrefs, // Include slug mappings for URL generation
        meta: {
          pagination: {
            page,
            limit,
            total: filteredBookmarks.length, // Use filtered count, not all bookmarks
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          filter: tagFilter ? { tag: tagFilter } : undefined, // Include filter info
          // Data version for client-side cache invalidation
          dataVersion: lastFetchedAt,
          lastRefreshed: new Date(lastFetchedAt).toISOString(),
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (err) {
    console.error("[API Bookmarks] Failed to fetch bookmarks:", err);
    const errorMessage = err instanceof Error ? err.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to fetch bookmarks", details: errorMessage }, { status: 500 });
  }
}
