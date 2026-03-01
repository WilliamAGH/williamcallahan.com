import { BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import {
  getBookmarks,
  getBookmarksIndex,
  getBookmarksPage,
  resolveBookmarkTagSlug,
} from "@/lib/bookmarks/service.server";
import { findRelatedBookmarkIdsForSeeds } from "@/lib/db/queries/embedding-similarity";
import { tagToSlug } from "@/lib/utils/tag-utils";
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

function extractTagNames(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const tags: string[] = [];
  for (const rawTag of rawTags) {
    if (typeof rawTag === "string") {
      const trimmed = rawTag.trim();
      if (trimmed.length > 0) {
        tags.push(trimmed);
      }
      continue;
    }
    if (typeof rawTag !== "object" || rawTag === null) {
      continue;
    }

    const candidateName = Reflect.get(rawTag, "name");
    if (typeof candidateName !== "string") {
      continue;
    }
    const trimmed = candidateName.trim();
    if (trimmed.length > 0) {
      tags.push(trimmed);
    }
  }
  return tags;
}

function bookmarkHasTagSlug(bookmark: { tags?: unknown }, normalizedTagSlug: string): boolean {
  const tags = extractTagNames(bookmark.tags);
  return tags.some((tag) => tagToSlug(tag).toLowerCase() === normalizedTagSlug);
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
    const discoverDegradationReasons: string[] = [];

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

      let rankedBookmarks: Awaited<ReturnType<typeof getDiscoveryRankedBookmarks>> = [];
      try {
        rankedBookmarks = await getDiscoveryRankedBookmarks(page, limit);
      } catch (error) {
        discoverDegradationReasons.push(
          "Discovery ranking unavailable. Falling back to latest ordering.",
        );
        console.warn(
          "[API Bookmarks] Discover ranking unavailable. Falling back to latest order.",
          error,
        );
      }

      if (rankedBookmarks.length > 0) {
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
                isDegraded: discoverDegradationReasons.length > 0,
                reasons: discoverDegradationReasons,
              },
              dataVersion: lastFetchedAt,
              lastRefreshed: new Date(lastFetchedAt).toISOString(),
            },
          },
          { headers: CACHE_HEADERS },
        );
      }

      console.warn(
        "[API Bookmarks] Discover feed requested, but no ranked rows were available. Falling back to latest order.",
      );
      discoverDegradationReasons.push(
        "Discover ranking returned no rows. Falling back to latest ordering.",
      );
    }

    if (!tagFilter && page > 0 && limit <= BOOKMARKS_PER_PAGE) {
      if (indexData) {
        const { totalPages, count: total, lastFetchedAt = getMonotonicTime() } = indexData;

        if (page <= totalPages) {
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
        }
      }
    }

    const allBookmarks = await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: true,
      skipExternalFetch: false,
      force: false,
    });
    const lastFetchedAt = indexData?.lastFetchedAt ?? getMonotonicTime();

    let filteredBookmarks: typeof allBookmarks = allBookmarks;

    const normalizedTagFilter = tagFilter ? decodeURIComponent(tagFilter).trim() : null;
    const resolvedTagFilter = normalizedTagFilter
      ? await resolveBookmarkTagSlug(normalizedTagFilter)
      : null;
    const normalizedTagFilterSlug = resolvedTagFilter?.canonicalSlug?.trim() || null;
    if (normalizedTagFilterSlug) {
      filteredBookmarks = filteredBookmarks.filter((bookmark) =>
        bookmarkHasTagSlug(bookmark, normalizedTagFilterSlug),
      );
    }

    const offset = (page - 1) * limit;
    const exactPageBookmarks = filteredBookmarks.slice(offset, offset + limit);
    let relatedBookmarks: typeof allBookmarks = [];

    if (tagFilter && page === 1 && exactPageBookmarks.length < limit) {
      try {
        const relatedIds = await findRelatedBookmarkIdsForSeeds({
          seedBookmarkIds: filteredBookmarks.slice(0, 3).map((bookmark) => bookmark.id),
          excludeIds: filteredBookmarks.map((bookmark) => bookmark.id),
          limit: limit - exactPageBookmarks.length,
        });
        const bookmarkById = new Map<string, (typeof allBookmarks)[number]>(
          allBookmarks.map((bookmark) => [bookmark.id, bookmark] as const),
        );
        relatedBookmarks = relatedIds
          .map((id) => bookmarkById.get(id))
          .filter((bookmark): bookmark is (typeof allBookmarks)[number] => Boolean(bookmark));
      } catch (error) {
        void error;
        console.warn(
          "[API Bookmarks] Semantic expansion unavailable; returning exact matches only.",
        );
      }
    }

    const paginatedBookmarks = [
      ...exactPageBookmarks,
      ...relatedBookmarks.slice(0, Math.max(0, limit - exactPageBookmarks.length)),
    ];
    const totalPages = Math.ceil(filteredBookmarks.length / limit);

    const slugMapping = await loadSlugMapping();
    const internalHrefs = buildInternalHrefs(paginatedBookmarks, slugMapping);

    return NextResponse.json(
      {
        data: paginatedBookmarks,
        internalHrefs,
        meta: {
          pagination: {
            limit,
            page,
            total: filteredBookmarks.length,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
          feed: "latest",
          filter: tagFilter
            ? {
                tag: tagFilter,
                exactCount: filteredBookmarks.length,
                relatedCount: relatedBookmarks.length,
                mode: "exact_plus_related",
              }
            : undefined,
          dataVersion: lastFetchedAt,
          lastRefreshed: new Date(lastFetchedAt).toISOString(),
        },
      },
      { headers: CACHE_HEADERS },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[API Bookmarks] Failed to fetch bookmarks:", errorMessage);
    const payload: { error: string; details?: string } = { error: "Failed to fetch bookmarks" };
    if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
      payload.details = errorMessage;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}
