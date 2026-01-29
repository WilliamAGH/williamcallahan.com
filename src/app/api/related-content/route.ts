/**
 * Related Content API Endpoint
 *
 * Returns related/suggested content for a given source content item
 * using similarity scoring across bookmarks, blog posts, investments, and projects.
 */

import { preventCaching, createErrorResponse, NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { NextRequest, NextResponse } from "next/server";
import {
  aggregateAllContent,
  getContentById,
  filterByTypes,
} from "@/lib/content-similarity/aggregator";
import { findMostSimilar, limitByTypeAndTotal, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { ServerCacheInstance } from "@/lib/server-cache";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { requestLock } from "@/lib/server/request-lock";
import { getMonotonicTime } from "@/lib/utils";
import type {
  RelatedContentItem,
  RelatedContentType,
  NormalizedContent,
} from "@/types/related-content";
import { similarityWeightsSchema } from "@/types/schemas/related-content";
import { getEnabledContentTypes, DEFAULT_MAX_PER_TYPE } from "@/config/related-content.config";

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours - content changes infrequently

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

function resolveRequestUrl(request: NextRequest): URL {
  return request.nextUrl;
}

/**
 * Parse a comma-separated list of content types from query params.
 * Filters to only enabled types in current environment.
 */
function parseTypesParam(value: string | null): RelatedContentType[] | undefined {
  if (!value) return undefined;
  const enabledTypes = new Set(getEnabledContentTypes());
  const parsed = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t): t is RelatedContentType => enabledTypes.has(t as RelatedContentType));
  return parsed.length ? parsed : undefined;
}

/**
 * Convert normalized content to related content item
 */
function toRelatedContentItem(
  content: NormalizedContent & { score: number },
): RelatedContentItem | null {
  const display = content.display;
  const safeDateIso =
    content.date && Number.isFinite(content.date.getTime())
      ? content.date.toISOString()
      : undefined;
  const baseMetadata: RelatedContentItem["metadata"] = {
    tags: content.tags,
    domain: content.domain,
    date: safeDateIso,
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

    case "book": {
      const bookDetails = display?.book;
      const metadata: RelatedContentItem["metadata"] = {
        ...baseMetadata,
        imageUrl: display?.imageUrl,
        authors: bookDetails?.authors,
        formats: bookDetails?.formats,
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
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      {
        data: [],
        meta: {
          pagination: {
            total: 0,
            totalPages: 0,
            page: 1,
            limit: 0,
            hasNext: false,
            hasPrev: false,
          },
          computeTime: 0,
          buildPhase: true,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  }
  preventCaching();
  const startTime = getMonotonicTime();

  try {
    // Parse query parameters
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const sourceTypeRaw = searchParams.get("type");
    // Use centralized config for enabled content types (filters production-hidden types)
    const enabledTypes = new Set(getEnabledContentTypes());
    const sourceType = enabledTypes.has(sourceTypeRaw as RelatedContentType)
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
        console.log(
          `[RelatedContent API] Resolved slug "${sourceSlug}" to bookmark ID "${sourceId}"`,
        );
      } else {
        return createErrorResponse(`Bookmark not found for slug: ${sourceSlug}`, 404);
      }
    }

    if (!sourceType || !sourceId) {
      return createErrorResponse(
        sourceType === "bookmark"
          ? "Missing required parameters: type and slug"
          : "Missing required parameters: type and id",
        400,
      );
    }

    const lockKey = `related-content:${sourceType}:${sourceId}`;

    // Parse optional parameters with validation
    const pageRaw = parseInt(searchParams.get("page") || "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
    const maxPerTypeRaw = parseInt(
      searchParams.get("maxPerType") || String(DEFAULT_MAX_PER_TYPE),
      10,
    );

    // Sanitize pagination params to prevent NaN/Infinity/negative values
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 10;
    const maxPerType =
      Number.isFinite(maxPerTypeRaw) && maxPerTypeRaw > 0
        ? Math.min(maxPerTypeRaw, 500)
        : DEFAULT_MAX_PER_TYPE;
    // parseTypesParam is now module-level and uses centralized config
    const includeTypes = parseTypesParam(searchParams.get("includeTypes"));
    const excludeTypes = parseTypesParam(searchParams.get("excludeTypes"));
    const debug = searchParams.get("debug") === "true";

    // Parse custom weights if provided
    let weights = DEFAULT_WEIGHTS;
    const customWeights = searchParams.get("weights");
    const hasCustomWeights = Boolean(customWeights);
    if (customWeights) {
      try {
        const parsed: unknown = JSON.parse(customWeights);
        const validation = similarityWeightsSchema.safeParse(parsed);
        if (validation.success) {
          weights = { ...DEFAULT_WEIGHTS, ...validation.data };
        } else {
          console.warn(
            `[RelatedContent] Custom weights validation failed: ${validation.error.message}`,
          );
        }
      } catch (error) {
        console.warn(
          `[RelatedContent] Failed to parse custom weights JSON:`,
          error instanceof Error ? error.message : "Invalid JSON",
        );
      }
    }

    // Parse excludeIds early to determine if we should skip caching
    // (excludeIds affects computed results but shouldn't pollute the cache)
    const excludeIdsParam = searchParams.get("excludeIds");
    const hasExcludeIds = Boolean(
      excludeIdsParam && excludeIdsParam.split(",").some((s) => s.trim().length > 0),
    );

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
          // Parse excludeIds for this request (use pre-parsed param)
          const excludeIds =
            excludeIdsParam
              ?.split(",")
              .map((s) => s.trim())
              .filter(Boolean) || [];
          excludeIds.push(sourceId);

          const candidates = allContent.filter(
            (item) => !(item.type === sourceType && excludeIds.includes(item.id)),
          );

          // Get a large number of similar items to allow for pagination
          const similar = findMostSimilar(source, candidates, 100, weights);

          // Only cache canonical computations (no debug/custom weights/excludeIds)
          // excludeIds affects the computed candidates, so caching with excludeIds
          // would pollute the cache with incomplete results for non-excluded requests
          if (!debug && !hasCustomWeights && !hasExcludeIds) {
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
      return createErrorResponse(
        `Content not found or failed to compute: ${sourceType}/${sourceId}`,
        404,
      );
    }

    // Apply filtering to cached results
    const cachedData = cached;
    let items = cachedData.items;
    // Apply type filters per-request
    if (includeTypes || excludeTypes) {
      items = filterByTypes(items, includeTypes, excludeTypes);
    }
    // Honor excludeIds on cache hits - filter BEFORE per-type limiting to avoid under-filled results
    const excludeIds = (excludeIdsParam?.split(",") || []).map((s) => s.trim()).filter(Boolean);
    excludeIds.push(sourceId);
    const excludeSet = new Set(excludeIds);

    // Remove excluded IDs first (type-scoped to avoid cross-type ID collisions)
    const eligible = items.filter((i) => !(i.type === sourceType && excludeSet.has(i.id)));

    // Apply per-type limits using shared utility (maxTotal=1000 is effectively unlimited for pagination)
    // Note: maxPerType is already sanitized at parse time (positive, finite, capped at 500)
    const sortedItems = limitByTypeAndTotal(eligible, maxPerType, 1000);

    // Apply pagination
    const totalItems = sortedItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = sortedItems.slice((page - 1) * limit, page * limit);

    const responseData = paginatedItems
      .map((item) => toRelatedContentItem(item))
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
    return createErrorResponse("Internal server error", 500);
  }
}
