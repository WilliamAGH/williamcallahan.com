/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to bookmarks with pagination support.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { getBookmarks, getBookmarksIndex, getBookmarksPage } from "@/lib/bookmarks/service.server";
import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import { preventCaching } from "@/lib/utils/api-utils";
import { type NextRequest, NextResponse } from "next/server";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import { tryGetEmbeddedSlug } from "@/lib/bookmarks/slug-helpers";
import { getMonotonicTime } from "@/lib/utils";
import { getDiscoveryRankedBookmarks } from "@/lib/db/queries/discovery-scores";
import { db } from "@/lib/db/connection";
import { aiAnalysisLatest } from "@/lib/db/schema/ai-analysis";

// This route can leverage the caching within getBookmarks

function buildInternalHrefs(
  items: Array<{ id: string } & Record<string, unknown>>,
  slugMapping: Parameters<typeof getSlugForBookmark>[0] | null,
): Record<string, string> {
  const res: Record<string, string> = {};
  for (const item of items) {
    const embedded = tryGetEmbeddedSlug(item);
    if (embedded) {
      res[item.id] = `/bookmarks/${embedded}`;
      continue;
    }
    if (slugMapping) {
      const mapped = getSlugForBookmark(slugMapping, item.id);
      if (mapped) res[item.id] = `/bookmarks/${mapped}`;
      else console.error(`[API Bookmarks] WARNING: No slug for bookmark ${item.id}`);
    } else {
      console.error(
        "[API Bookmarks] CRITICAL: No slug mapping and no embedded slug - URLs may 404",
      );
    }
  }
  return res;
}

function applyCategoryDiversity<T extends { category: string | null }>(items: T[]): T[] {
  const diversified = [...items];
  for (let index = 2; index < diversified.length; index += 1) {
    const current = diversified[index];
    const previous = diversified[index - 1];
    const beforePrevious = diversified[index - 2];
    if (
      !current?.category ||
      current.category !== previous?.category ||
      current.category !== beforePrevious?.category
    ) {
      continue;
    }

    const swapIndex = diversified.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && candidate.category !== current.category,
    );
    if (swapIndex === -1) {
      continue;
    }

    const swapCandidate = diversified[swapIndex];
    if (!swapCandidate) {
      continue;
    }
    diversified[index] = swapCandidate;
    diversified[swapIndex] = current;
  }
  return diversified;
}

async function attachBookmarkCategories<T extends { id: string } & Record<string, unknown>>(
  items: T[],
): Promise<Array<T & { category: string | null }>> {
  if (items.length === 0) {
    return [];
  }

  const bookmarkIds = [...new Set(items.map((item) => item.id))];
  const categoryExpression = sql<
    string | null
  >`nullif(trim(${aiAnalysisLatest.payload} -> 'analysis' ->> 'category'), '')`;
  const categoryRows = await db
    .select({
      entityId: aiAnalysisLatest.entityId,
      category: categoryExpression,
    })
    .from(aiAnalysisLatest)
    .where(
      and(
        eq(aiAnalysisLatest.domain, "bookmarks"),
        inArray(aiAnalysisLatest.entityId, bookmarkIds),
      ),
    );

  const categoryByBookmarkId = new Map(
    categoryRows
      .filter((row) => row.category !== null)
      .map((row) => [row.entityId, row.category] as const),
  );

  return items.map((item) => ({
    ...item,
    category: categoryByBookmarkId.get(item.id) ?? null,
  }));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  preventCaching();
  console.log("[API Bookmarks] Received GET request for bookmarks");

  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);

  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

  // Get tag filter parameter
  const tagFilter = searchParams.get("tag") || null;
  const feedQuery = searchParams.get("feed");
  const feedMode = feedQuery === "latest" ? "latest" : "discover";

  try {
    const indexData = await getBookmarksIndex();

    if (feedMode === "discover" && !tagFilter) {
      let rankedBookmarks: Awaited<ReturnType<typeof getDiscoveryRankedBookmarks>> = [];
      try {
        rankedBookmarks = await getDiscoveryRankedBookmarks(page, limit);
      } catch (error) {
        console.warn(
          "[API Bookmarks] Discover ranking unavailable. Falling back to latest order.",
          error,
        );
      }

      if (rankedBookmarks.length > 0) {
        const diversifiedBookmarks = applyCategoryDiversity(rankedBookmarks);
        const bookmarkData = diversifiedBookmarks.map((entry) => ({
          ...entry.bookmark,
          category: entry.category ?? null,
        }));
        const slugMapping = await loadSlugMapping();
        const internalHrefs = buildInternalHrefs(bookmarkData, slugMapping);
        const total = indexData?.count ?? bookmarkData.length;
        const totalPages = Math.ceil(total / limit);
        const lastFetchedAt = indexData?.lastFetchedAt ?? getMonotonicTime();

        return NextResponse.json(
          {
            data: bookmarkData,
            internalHrefs,
            meta: {
              pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
              },
              feed: "discover",
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

      console.warn(
        "[API Bookmarks] Discover feed requested, but no ranked rows were available. Falling back to latest order.",
      );
    }

    // Fast-path: only when the caller requests **one standard page** worth of data
    // If the client asks for more than BOOKMARKS_PER_PAGE (24) items we must
    // fall back to the full-dataset path otherwise search on the bookmarks page
    // will miss results that live beyond page 1.
    if (!tagFilter && page > 0 && limit <= BOOKMARKS_PER_PAGE) {
      if (indexData) {
        const { totalPages, count: total, lastFetchedAt = getMonotonicTime() } = indexData;

        if (page <= totalPages) {
          // Load just the requested page
          const paginatedBookmarks = await getBookmarksPage(page);
          console.log(
            `[API Bookmarks] Loaded page ${page} directly (${paginatedBookmarks.length} items)`,
          );

          // CRITICAL: Generate slug mappings for fast-path too
          const slugMapping = await loadSlugMapping();
          const internalHrefs = buildInternalHrefs(paginatedBookmarks, slugMapping);

          return NextResponse.json(
            {
              data: await attachBookmarkCategories(paginatedBookmarks),
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
                feed: "latest",
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
    const allBookmarks = await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: true,
      skipExternalFetch: false,
      force: false,
    });

    const lastFetchedAt = indexData?.lastFetchedAt ?? getMonotonicTime();

    // Apply tag filter if provided
    let filteredBookmarks = allBookmarks;
    if (tagFilter) {
      // Decode and normalize to slug for stable comparison
      const decodedTag = decodeURIComponent(tagFilter);
      const normalizedQuerySlug = (
        decodedTag.includes("-") ? decodedTag : tagToSlug(decodedTag)
      ).toLowerCase();

      filteredBookmarks = allBookmarks.filter((bookmark) => {
        const tags = normalizeTagsToStrings(bookmark.tags);
        return tags.some((tag) => tagToSlug(tag).toLowerCase() === normalizedQuerySlug);
      });

      console.log(
        `[API Bookmarks] Filtering by tag "${decodedTag}" (slug: "${normalizedQuerySlug}"): ${filteredBookmarks.length} of ${allBookmarks.length} bookmarks match`,
      );
    }

    // Calculate pagination on filtered results
    const offset = (page - 1) * limit;
    const paginatedBookmarks = filteredBookmarks.slice(offset, offset + limit);
    const categorizedBookmarks = await attachBookmarkCategories(paginatedBookmarks);
    const totalPages = Math.ceil(filteredBookmarks.length / limit);

    // CRITICAL: Generate slug mappings for all bookmarks being returned
    // Without these, the client cannot generate valid URLs and will get 404s
    const slugMapping = await loadSlugMapping();
    const internalHrefs = buildInternalHrefs(categorizedBookmarks, slugMapping);

    console.log(
      `[API Bookmarks] Returning page ${page}/${totalPages} with ${paginatedBookmarks.length} bookmarks${tagFilter ? ` (filtered by tag: ${tagFilter})` : ""}`,
    );

    return NextResponse.json(
      {
        data: categorizedBookmarks,
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
          feed: "latest",
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
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[API Bookmarks] Failed to fetch bookmarks:", errorMessage);
    // Include details in non-production environments to aid testing/debugging
    const payload: { error: string; details?: string } = { error: "Failed to fetch bookmarks" };
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      payload.details = errorMessage;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}
