import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import {
  getBookmarksByTag,
  getBookmarksIndex,
  getBookmarksPage,
  resolveBookmarkTagSlug,
} from "@/lib/bookmarks/service.server";
import { preventCaching } from "@/lib/utils/api-utils";
import { type NextRequest, NextResponse } from "next/server";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import { tryGetEmbeddedSlug } from "@/lib/bookmarks/slug-helpers";
import { getMonotonicTime } from "@/lib/utils";
import { getDiscoveryRankedBookmarks } from "@/lib/db/queries/discovery-scores";
import { getDiscoveryGroupedBookmarks } from "@/lib/db/queries/discovery-grouped";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

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

export async function GET(request: NextRequest): Promise<NextResponse> {
  preventCaching();

  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const rawPage = Number.parseInt(searchParams.get("page") || "1", 10);
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage);
  const rawLimit = Number.parseInt(searchParams.get("limit") || "20", 10);
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(100, Math.max(1, rawLimit));

  const tagFilter = searchParams.get("tag") || null;
  const feedQuery = searchParams.get("feed");
  const feedMode = feedQuery === "latest" ? "latest" : "discover";
  const discoverView = searchParams.get("discoverView");
  const rawSectionPage = Number.parseInt(searchParams.get("sectionPage") || "1", 10);
  const sectionPage = Number.isNaN(rawSectionPage) ? 1 : Math.max(1, rawSectionPage);
  const rawSectionsPerPage = Number.parseInt(searchParams.get("sectionsPerPage") || "4", 10);
  const sectionsPerPage = Number.isNaN(rawSectionsPerPage)
    ? 4
    : Math.min(12, Math.max(1, rawSectionsPerPage));

  try {
    const indexData = await getBookmarksIndex();

    if (feedMode === "discover" && !tagFilter) {
      if (discoverView === "grouped") {
        const groupedDiscoverData = await getDiscoveryGroupedBookmarks({
          sectionPage,
          sectionsPerPage,
        });
        return NextResponse.json(
          {
            data: groupedDiscoverData,
            meta: {
              feed: "discover",
              view: "grouped",
              pagination: groupedDiscoverData.pagination,
              degraded: groupedDiscoverData.degradation,
            },
          },
          { headers: CACHE_HEADERS },
        );
      }

      // Discover ranking is a required feature - propagate errors explicitly [RC1]
      const rankedBookmarks = await getDiscoveryRankedBookmarks(page, limit);

      const bookmarkData = rankedBookmarks.map((entry) => entry.bookmark);
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
            degraded: {
              isDegraded: false,
              reasons: [],
            },
            dataVersion: lastFetchedAt,
            lastRefreshed: new Date(lastFetchedAt).toISOString(),
          },
        },
        { headers: CACHE_HEADERS },
      );
    }

    if (tagFilter) {
      const normalizedTagFilter = decodeURIComponent(tagFilter).trim();
      const resolved = await resolveBookmarkTagSlug(normalizedTagFilter);
      const canonicalTagSlug = resolved.canonicalSlug;

      const {
        bookmarks: tagBookmarks,
        totalCount: total,
        totalPages,
      } = await getBookmarksByTag(canonicalTagSlug, page);

      const slugMapping = await loadSlugMapping();
      const internalHrefs = buildInternalHrefs(tagBookmarks, slugMapping);
      const lastFetchedAt = indexData?.lastFetchedAt ?? getMonotonicTime();

      return NextResponse.json(
        {
          data: tagBookmarks,
          internalHrefs,
          meta: {
            pagination: {
              page,
              limit: BOOKMARKS_PER_PAGE,
              total,
              totalPages,
              hasNext: page < totalPages,
              hasPrev: page > 1,
            },
            feed: "latest",
            filter: {
              tag: tagFilter,
              resolvedTag: resolved.canonicalTagName,
              mode: "exact",
            },
            dataVersion: lastFetchedAt,
            lastRefreshed: new Date(lastFetchedAt).toISOString(),
          },
        },
        { headers: CACHE_HEADERS },
      );
    }

    // Default latest feed path
    const {
      totalPages,
      count: total,
      lastFetchedAt = getMonotonicTime(),
    } = indexData ?? {
      totalPages: 1,
      count: 0,
      lastFetchedAt: getMonotonicTime(),
    };

    const paginatedBookmarks = await getBookmarksPage(page);
    const slugMapping = await loadSlugMapping();
    const internalHrefs = buildInternalHrefs(paginatedBookmarks, slugMapping);

    return NextResponse.json(
      {
        data: paginatedBookmarks,
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
          feed: "latest",
          dataVersion: lastFetchedAt,
          lastRefreshed: new Date(lastFetchedAt).toISOString(),
        },
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[API Bookmarks] Failed to fetch bookmarks:", errorMessage);
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 });
  }
}
