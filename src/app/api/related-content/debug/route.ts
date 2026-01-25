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
import type { RelatedContentType } from "@/types/related-content";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

export async function GET(request: NextRequest) {
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      {
        buildPhase: true,
        message: "Related-content debug disabled during build phase",
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
  preventCaching();
  try {
    const searchParams = request.nextUrl.searchParams;
    const sourceTypeRaw = searchParams.get("type");
    const sourceId = searchParams.get("id");
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10);
    // Use centralized config for enabled content types
    const enabledTypes = getEnabledContentTypes();
    const enabledTypesSet = new Set<RelatedContentType>(enabledTypes);
    const sourceType = enabledTypesSet.has(sourceTypeRaw as RelatedContentType)
      ? (sourceTypeRaw as RelatedContentType)
      : null;
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));

    if (!sourceType || !sourceId) {
      return createErrorResponse("Missing required parameters: type and id", 400);
    }

    // Get source content
    const source = await getContentById(sourceType, sourceId);
    if (!source) {
      return createErrorResponse(`Content not found: ${sourceType}/${sourceId}`, 404);
    }

    // Get all content
    const allContent = await aggregateAllContent();

    // Filter out the source item
    const candidates = allContent.filter(item => !(item.type === sourceType && item.id === sourceId));

    // Calculate similarity for ALL items with detailed breakdown
    const scoredItems = candidates.map(candidate => {
      const { total, breakdown } = calculateSimilarity(source, candidate, DEFAULT_WEIGHTS);
      return {
        type: candidate.type,
        id: candidate.id,
        title: candidate.title,
        tags: candidate.tags,
        domain: candidate.domain,
        score: total,
        breakdown,
        // Show what matched
        matchedTags: source.tags.filter(tag => candidate.tags.some(t => t.toLowerCase() === tag.toLowerCase())),
      };
    });

    // Sort by score
    const sorted = scoredItems.toSorted((a, b) => b.score - a.score);

    // Group by content type dynamically
    const byType: Record<string, typeof scoredItems> = {};
    const byTypeStats: Record<string, number> = {};
    for (const type of enabledTypes) {
      byType[type] = sorted.filter(i => i.type === type).slice(0, limit);
      byTypeStats[type] = candidates.filter(i => i.type === type).length;
    }

    // Find top cross-content matches (different types only)
    const crossContent = sorted.filter(i => i.type !== sourceType).slice(0, limit);

    return NextResponse.json(
      {
        source: {
          type: source.type,
          id: source.id,
          title: source.title,
          tags: source.tags,
          domain: source.domain,
          textPreview: source.text.slice(0, 200) + "...",
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
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Debug endpoint error:", details);
    // Only expose detailed error messages in development
    const message =
      process.env.NODE_ENV === "development" ? `Internal server error: ${details}` : "Internal server error";
    return createErrorResponse(message, 500);
  }
}
