/**
 * Related Content API Endpoint
 *
 * Returns related/suggested content for a given source content item
 * using similarity scoring across bookmarks, blog posts, investments, and projects.
 */

import { unstable_noStore as noStore } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { aggregateAllContent, getContentById, filterByTypes } from "@/lib/content-similarity/aggregator";
import { findMostSimilar, groupByType, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { ServerCacheInstance } from "@/lib/server-cache";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { requestLock } from "@/lib/server/request-lock";
import { getMonotonicTime } from "@/lib/utils";
import type {
  RelatedContentItem,
  RelatedContentType,
  SimilarityWeights,
  NormalizedContent,
} from "@/types/related-content";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

function resolveRequestUrl(request: NextRequest): URL {
  return request.nextUrl;
}

// Default options
const DEFAULT_MAX_PER_TYPE = 3;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Convert normalized content to related content item
 */
function toRelatedContentItem(content: NormalizedContent & { score: number }): RelatedContentItem | null {
  const display = content.display;
  const baseMetadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: content.date?.toISOString(),
  };

  // Add type-specific metadata
  switch (content.type) {
    case "bookmark": {
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: display?.imageUrl,
      };
      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "blog": {
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        readingTime: display?.readingTime,
        imageUrl: display?.imageUrl,
        author: display?.author,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "investment": {
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        stage: display?.stage,
        category: display?.category,
        imageUrl: display?.imageUrl,
      };

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || "",
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    case "project": {
      const imageKey = display?.project?.imageKey;
      const metadata: RelatedContentItem["metadata"] = imageKey
        ? { ...baseMetadata, imageUrl: `/api/s3/${imageKey}` }
        : baseMetadata;

      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: display?.description || content.text,
        url: content.url,
        score: content.score,
        metadata,
      };
    }

    default:
      return {
        type: content.type,
        id: content.id,
        title: content.title,
        description: content.text,
        url: content.url,
        score: content.score,
        metadata: baseMetadata,
      };
  }
}

export async function GET(request: NextRequest) {
  if (isProductionBuild) {
    return NextResponse.json(
      {
        data: [],
        meta: {
          pagination: { total: 0, totalPages: 0, page: 1, limit: 0, hasNext: false, hasPrev: false },
          computeTime: 0,
          buildPhase: true,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  }
  noStore();
  const startTime = getMonotonicTime();

  try {
    // Parse query parameters
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const sourceTypeRaw = searchParams.get("type");
    const allowedTypes = new Set<RelatedContentType>(["bookmark", "blog", "investment", "project"]);
    const sourceType = allowedTypes.has(sourceTypeRaw as RelatedContentType)
      ? (sourceTypeRaw as RelatedContentType)
      : null;

    // For bookmarks, we should use slug instead of id to maintain idempotency
    // For other content types, we still use id
    let sourceId = searchParams.get("id");
    const sourceSlug = searchParams.get("slug");

    // If this is a bookmark request with a slug, convert it to ID
    if (sourceType === "bookmark" && sourceSlug) {
      const bookmarkId = await resolveBookmarkIdFromSlug(sourceSlug);
      if (bookmarkId) {
        sourceId = bookmarkId;
        console.log(`[RelatedContent API] Resolved slug "${sourceSlug}" to bookmark ID "${sourceId}"`);
      } else {
        return NextResponse.json(
          { error: `Bookmark not found for slug: ${sourceSlug}` },
          {
            status: 404,
            headers: NO_STORE_HEADERS,
          },
        );
      }
    }

    if (!sourceType || !sourceId) {
      return NextResponse.json(
        {
          error:
            sourceType === "bookmark"
              ? "Missing required parameters: type and slug"
              : "Missing required parameters: type and id",
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const lockKey = `related-content:${sourceType}:${sourceId}`;

    // Parse optional parameters
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const maxPerType = parseInt(searchParams.get("maxPerType") || String(DEFAULT_MAX_PER_TYPE), 10);
    const parseTypesParam = (value: string | null): RelatedContentType[] | undefined => {
      if (!value) return undefined;
      const allowed: RelatedContentType[] = ["bookmark", "blog", "investment", "project"];
      const set = new Set(allowed);
      const parsed = value
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .filter((t): t is RelatedContentType => set.has(t as RelatedContentType));
      return parsed.length ? parsed : undefined;
    };
    const includeTypes = parseTypesParam(searchParams.get("includeTypes"));
    const excludeTypes = parseTypesParam(searchParams.get("excludeTypes"));
    const debug = searchParams.get("debug") === "true";

    // Parse custom weights if provided
    let weights = DEFAULT_WEIGHTS;
    const customWeights = searchParams.get("weights");
    const hasCustomWeights = Boolean(customWeights);
    if (customWeights) {
      try {
        const parsed = JSON.parse(customWeights) as Partial<SimilarityWeights>;
        weights = { ...DEFAULT_WEIGHTS, ...parsed };
      } catch {
        // Use default weights if parsing fails
      }
    }

    // Check cache first
    let cached = ServerCacheInstance.getRelatedContent(sourceType, sourceId);

    // If cache is stale/missing, or custom weights/debug requested, compute it (with a lock)
    const now = getMonotonicTime();
    if (!cached || now - cached.timestamp >= CACHE_TTL || debug || hasCustomWeights) {
      await requestLock.run({
        key: lockKey,
        work: async () => {
          const source = await getContentById(sourceType, sourceId);
          if (!source) {
            return;
          }

          const allContent = await aggregateAllContent();
          // Parse excludeIds for this request
          const excludeIds = searchParams.get("excludeIds")?.split(",") || [];
          excludeIds.push(sourceId);

          const candidates = allContent.filter(item => !(item.type === sourceType && excludeIds.includes(item.id)));

          // Get a large number of similar items to allow for pagination
          const similar = findMostSimilar(source, candidates, 100, weights);

          // Only cache canonical computations (no debug/custom weights)
          if (!debug && !hasCustomWeights) {
            ServerCacheInstance.setRelatedContent(sourceType, sourceId, {
              items: similar,
              timestamp: now,
            });
          }
        },
      });

      cached = ServerCacheInstance.getRelatedContent(sourceType, sourceId);
    }

    if (!cached) {
      return NextResponse.json(
        { error: `Content not found or failed to compute: ${sourceType}/${sourceId}` },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    // Apply filtering to cached results
    const cachedData = cached;
    let items = cachedData.items;
    // Apply type filters per-request
    if (includeTypes || excludeTypes) {
      items = filterByTypes(items, includeTypes, excludeTypes);
    }
    // Honor excludeIds on cache hits
    const excludeIds = (searchParams.get("excludeIds")?.split(",") || []).map(s => s.trim());
    excludeIds.push(sourceId);

    // Apply per-type limits
    const grouped = groupByType(items);
    const limited: typeof items = [];

    for (const [, typeItems] of Object.entries(grouped)) {
      if (typeItems) {
        const limitedTypeItems = typeItems.slice(0, maxPerType);
        limited.push(...limitedTypeItems);
      }
    }

    const sortedItems = limited.toSorted((a, b) => b.score - a.score);

    // Apply pagination
    // Remove excluded IDs before pagination
    const withoutExcluded = sortedItems.filter(i => !excludeIds.includes(i.id));
    const totalItems = withoutExcluded.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = withoutExcluded.slice((page - 1) * limit, page * limit);

    const responseData = paginatedItems
      .map(item => toRelatedContentItem(item))
      .filter((item): item is RelatedContentItem => item !== null);

    const response = {
      data: responseData,
      meta: {
        pagination: {
          total: totalItems,
          totalPages,
          page,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
        computeTime: getMonotonicTime() - startTime,
      },
    };

    return NextResponse.json(response, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Error in related content API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
