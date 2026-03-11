/**
 * Related Content API Endpoint
 *
 * Returns related/suggested content for a given source content item
 * using pgvector cosine similarity with blended scoring.
 */

import { preventCaching, createErrorResponse, NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { NextRequest, NextResponse } from "next/server";
import { limitByTypeAndTotal } from "@/lib/utils/limit-by-type";
import { findSimilarByEntity } from "@/lib/db/queries/cross-domain-similarity";
import { applyBlendedScoring } from "@/lib/content-graph/blended-scoring";
import { hydrateRelatedContent } from "@/lib/db/queries/content-hydration";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { requestLock } from "@/lib/server/request-lock";
import { getMonotonicTime } from "@/lib/utils";
import type { RelatedContentSuggestion } from "@/types/related-content";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";
import { getEnabledContentTypes, DEFAULT_MAX_PER_TYPE } from "@/config/related-content.config";
import type { RelatedContentType } from "@/types/schemas/related-content";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

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
    const searchParams = request.nextUrl.searchParams;
    const sourceTypeRaw = searchParams.get("type");
    const enabledTypes = new Set(getEnabledContentTypes());
    const sourceType = enabledTypes.has(sourceTypeRaw as RelatedContentType)
      ? (sourceTypeRaw as RelatedContentType)
      : null;

    let sourceId = searchParams.get("id");
    const sourceSlug = searchParams.get("slug");

    // For bookmarks, resolve slug to ID
    if (sourceType === "bookmark" && sourceSlug) {
      const bookmarkId = await resolveBookmarkIdFromSlug(sourceSlug);
      if (bookmarkId) {
        sourceId = bookmarkId;
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

    // Parse optional parameters with validation
    const pageRaw = parseInt(searchParams.get("page") || "1", 10);
    const limitRaw = parseInt(searchParams.get("limit") || "10", 10);
    const maxPerTypeRaw = parseInt(
      searchParams.get("maxPerType") || String(DEFAULT_MAX_PER_TYPE),
      10,
    );

    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const MAX_LIMIT = 100;
    const DEFAULT_LIMIT = 10;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= MAX_LIMIT ? limitRaw : DEFAULT_LIMIT;
    const maxPerType =
      Number.isFinite(maxPerTypeRaw) && maxPerTypeRaw > 0
        ? Math.min(maxPerTypeRaw, 500)
        : DEFAULT_MAX_PER_TYPE;
    const includeTypes = parseTypesParam(searchParams.get("includeTypes"));
    const excludeTypes = parseTypesParam(searchParams.get("excludeTypes"));
    const excludeIdsParam = searchParams.get("excludeIds");

    const lockKey = `related-content:${sourceType}:${sourceId}`;
    const finalSourceId = sourceId;

    // Run similarity search under request lock to prevent duplicate work
    const hydratedItems = await requestLock.run<RelatedContentSuggestion[] | null>({
      key: lockKey,
      work: async () => {
        const sourceDomain: ContentEmbeddingDomain = sourceType;
        const candidates = await findSimilarByEntity({
          sourceDomain,
          sourceId: finalSourceId,
          limit: 30,
        });

        if (candidates.length === 0) return null;

        const scored = applyBlendedScoring(candidates, {
          sourceDomain,
          maxPerDomain: 5,
          maxTotal: 20,
        });

        return hydrateRelatedContent(scored);
      },
    });

    if (!hydratedItems || hydratedItems.length === 0) {
      return createErrorResponse(`No related content found for: ${sourceType}/${sourceId}`, 404);
    }

    // Apply request-scoped filters
    let items = hydratedItems;
    if (includeTypes) {
      const inc = new Set(includeTypes);
      items = items.filter((i) => inc.has(i.type));
    }
    if (excludeTypes) {
      const exc = new Set(excludeTypes);
      items = items.filter((i) => !exc.has(i.type));
    }

    const excludeIds = new Set(
      (excludeIdsParam?.split(",") || []).map((s) => s.trim()).filter(Boolean),
    );
    excludeIds.add(sourceId);
    items = items.filter((i) => !(i.type === sourceType && excludeIds.has(i.id)));

    // Apply per-type limits (maxTotal=1000 is effectively unlimited for pagination)
    const sortedItems = limitByTypeAndTotal(items, maxPerType, 1000);

    // Paginate
    const totalItems = sortedItems.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedItems = sortedItems.slice((page - 1) * limit, page * limit);

    return NextResponse.json(
      {
        data: paginatedItems,
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
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("Error in related content API:", error);
    return createErrorResponse("Internal server error", 500);
  }
}
