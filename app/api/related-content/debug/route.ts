/**
 * Debug endpoint for related content similarity scoring
 *
 * This endpoint helps diagnose why certain content types are or aren't matching
 */

import { NextResponse, type NextRequest } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { aggregateAllContent, getContentById } from "@/lib/content-similarity/aggregator";
import { calculateSimilarity, DEFAULT_WEIGHTS } from "@/lib/content-similarity";
import type { RelatedContentType } from "@/types/related-content";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };

function buildAbsoluteUrl(value: string, headersList: Headers): URL {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return new URL(value);
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const host = headersList.get("host") ?? "localhost";
  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return new URL(`${protocol}://${host}${normalizedPath}`);
}

export async function GET(request: NextRequest) {
  noStore();
  try {
    const headersList = request.headers;
    const nextUrlHeader = headersList.get("next-url") ?? "/api/related-content/debug";
    const searchParams = buildAbsoluteUrl(nextUrlHeader, headersList).searchParams;
    const sourceTypeRaw = searchParams.get("type");
    const sourceId = searchParams.get("id");
    const limitRaw = parseInt(searchParams.get("limit") || "20", 10);
    const allowedTypes = new Set<RelatedContentType>(["bookmark", "blog", "investment", "project"]);
    const sourceType = allowedTypes.has(sourceTypeRaw as RelatedContentType)
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

    // Group by content type
    const byType = {
      bookmark: sorted.filter(i => i.type === "bookmark").slice(0, limit),
      blog: sorted.filter(i => i.type === "blog").slice(0, limit),
      investment: sorted.filter(i => i.type === "investment").slice(0, limit),
      project: sorted.filter(i => i.type === "project").slice(0, limit),
    };

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
          byType: {
            bookmarks: candidates.filter(i => i.type === "bookmark").length,
            blogs: candidates.filter(i => i.type === "blog").length,
            investments: candidates.filter(i => i.type === "investment").length,
            projects: candidates.filter(i => i.type === "project").length,
          },
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
