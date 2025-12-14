/**
 * Debug endpoint for related content similarity scoring
 *
 * This endpoint helps diagnose why certain content types are or aren't matching
 */

import { NextResponse, type NextRequest } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { aggregateAllContent, getContentById } from "@/lib/content-similarity/aggregator";
import { calculateSimilarity, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import { getEnabledContentTypes } from "@/config/related-content.config";
import type { RelatedContentType } from "@/types/related-content";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

export async function GET(request: NextRequest) {
  if (isProductionBuild) {
    return NextResponse.json(
      {
        buildPhase: true,
        message: "Related-content debug disabled during build phase",
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
  if (typeof noStore === "function") {
    noStore();
  }
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
      return NextResponse.json(
        { error: "Missing required parameters: type and id" },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    // Get source content
    const source = await getContentById(sourceType, sourceId);
    if (!source) {
      return NextResponse.json(
        { error: `Content not found: ${sourceType}/${sourceId}` },
        {
          status: 404,
          headers: NO_STORE_HEADERS,
        },
      );
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
    console.error("Debug endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : String(error) },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
