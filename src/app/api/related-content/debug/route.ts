/**
 * Debug endpoint for related content similarity scoring
 *
 * This endpoint helps diagnose why certain content types are or aren't matching
 */

import { preventCaching, createErrorResponse, NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";
import { aggregateAllContent, getContentById } from "@/lib/content-similarity/aggregator";
import { calculateSimilarity, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { getEnabledContentTypes } from "@/config/related-content.config";
import type {
  RelatedContentType,
  NormalizedContent,
  DebugParams,
  ScoredItem,
  DebugResponseArgs,
} from "@/types/related-content";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const TEXT_PREVIEW_LENGTH = 200;

/**
 * Parse and validate request parameters for the debug endpoint.
 * @returns Validated params or null if validation fails
 */
function parseDebugParams(searchParams: URLSearchParams): DebugParams | null {
  const sourceTypeRaw = searchParams.get("type");
  const sourceId = searchParams.get("id");
  const limitRaw = parseInt(searchParams.get("limit") || String(DEFAULT_LIMIT), 10);

  const enabledTypes = getEnabledContentTypes();
  const enabledTypesSet = new Set<RelatedContentType>(enabledTypes);

  const sourceType = enabledTypesSet.has(sourceTypeRaw as RelatedContentType)
    ? (sourceTypeRaw as RelatedContentType)
    : null;

  const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

  if (!sourceType || !sourceId) {
    return null;
  }

  return { sourceType, sourceId, limit, enabledTypes };
}

/**
 * Calculate similarity scores for all candidates against the source content.
 */
function scoreCandidates(source: NormalizedContent, candidates: NormalizedContent[]): ScoredItem[] {
  return candidates.map(candidate => {
    const { total, breakdown } = calculateSimilarity(source, candidate, DEFAULT_WEIGHTS);
    return {
      type: candidate.type,
      id: candidate.id,
      title: candidate.title,
      tags: candidate.tags,
      domain: candidate.domain,
      score: total,
      breakdown,
      matchedTags: source.tags.filter(tag => candidate.tags.some(t => t.toLowerCase() === tag.toLowerCase())),
    };
  });
}

/**
 * Group scored items by content type with statistics.
 */
function groupByType(
  sorted: ScoredItem[],
  candidates: NormalizedContent[],
  enabledTypes: RelatedContentType[],
  limit: number,
): { byType: Record<string, ScoredItem[]>; byTypeStats: Record<string, number> } {
  const byType: Record<string, ScoredItem[]> = {};
  const byTypeStats: Record<string, number> = {};

  for (const type of enabledTypes) {
    byType[type] = sorted.filter(i => i.type === type).slice(0, limit);
    byTypeStats[type] = candidates.filter(i => i.type === type).length;
  }

  return { byType, byTypeStats };
}

/**
 * Build the debug response payload.
 */
function buildDebugResponse({ source, sorted, candidates, byType, byTypeStats, crossContent }: DebugResponseArgs) {
  return {
    source: {
      type: source.type,
      id: source.id,
      title: source.title,
      tags: source.tags,
      domain: source.domain,
      textPreview: source.text.slice(0, TEXT_PREVIEW_LENGTH) + "...",
    },
    statistics: {
      totalCandidates: candidates.length,
      byType: byTypeStats,
      topScores: {
        overall: sorted[0]?.score || 0,
        crossContent: crossContent[0]?.score || 0,
      },
    },
    topMatches: {
      overall: sorted.slice(0, 10),
      byType,
      crossContent,
    },
    weights: DEFAULT_WEIGHTS,
    debug: {
      message: "Use this data to understand why content is or isn't matching",
      interpretation: {
        tagMatch: "0-1 score for shared tags (Jaccard similarity)",
        textSimilarity: "0-1 score for text overlap",
        domainMatch: "0-1 score for same domain (bookmarks)",
        recency: "0-1 score based on age (newer = higher)",
      },
    },
  };
}

export async function GET(request: NextRequest) {
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      { buildPhase: true, message: "Related-content debug disabled during build phase" },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  preventCaching();

  try {
    // Parse and validate parameters
    const params = parseDebugParams(request.nextUrl.searchParams);
    if (!params) {
      return createErrorResponse("Missing required parameters: type and id", 400);
    }

    const { sourceType, sourceId, limit, enabledTypes } = params;

    // Get source content
    const source = await getContentById(sourceType, sourceId);
    if (!source) {
      return createErrorResponse(`Content not found: ${sourceType}/${sourceId}`, 404);
    }

    // Get all content and filter out source
    const allContent = await aggregateAllContent();
    const candidates = allContent.filter(item => !(item.type === sourceType && item.id === sourceId));

    // Calculate similarity scores
    const scoredItems = scoreCandidates(source, candidates);
    const sorted = scoredItems.toSorted((a, b) => b.score - a.score);

    // Group by type and find cross-content matches
    const { byType, byTypeStats } = groupByType(sorted, candidates, enabledTypes, limit);
    const crossContent = sorted.filter(i => i.type !== sourceType).slice(0, limit);

    // Build and return response
    const responsePayload = buildDebugResponse({
      source,
      sorted,
      candidates,
      byType,
      byTypeStats,
      crossContent,
    });
    return NextResponse.json(responsePayload, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Debug endpoint error:", details);
    const message =
      process.env.NODE_ENV === "development" ? `Internal server error: ${details}` : "Internal server error";
    return createErrorResponse(message, 500);
  }
}
