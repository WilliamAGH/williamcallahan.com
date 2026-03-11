/**
 * Debug endpoint for related content similarity scoring.
 *
 * Exposes the pgvector cosine similarity pipeline internals:
 * raw ANN candidates, blended scores, and hydrated items.
 */

import { preventCaching, createErrorResponse, NO_STORE_HEADERS } from "@/lib/utils/api-utils";
import { NextResponse, type NextRequest } from "next/server";
import {
  findSimilarByEntity,
  sourceEmbeddingExists,
} from "@/lib/db/queries/cross-domain-similarity";
import { applyBlendedScoring } from "@/lib/content-graph/blended-scoring";
import { hydrateRelatedContent } from "@/lib/db/queries/content-hydration";
import { z } from "zod/v4";
import { getEnabledContentTypes } from "@/config/related-content.config";
import type { RelatedContentType } from "@/types/related-content";
import type { ContentEmbeddingDomain } from "@/types/db/embeddings";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and validate request parameters for the debug endpoint.
 */
function parseDebugParams(
  searchParams: URLSearchParams,
): { sourceType: RelatedContentType; sourceId: string; limit: number } | null {
  const sourceTypeRaw = searchParams.get("type") ?? undefined;
  const sourceId = searchParams.get("id") ?? undefined;
  const limitParam = searchParams.get("limit");
  const limitRaw = limitParam?.trim() ? limitParam : undefined;

  const enabledTypes = getEnabledContentTypes();
  const enabledTypesSet = new Set<string>(enabledTypes);
  const isEnabledType = (value: string): value is RelatedContentType => enabledTypesSet.has(value);

  const schema = z.object({
    type: z.string().refine(isEnabledType, { message: "Unsupported type" }),
    id: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  });

  const parsed = schema.safeParse({ type: sourceTypeRaw, id: sourceId, limit: limitRaw });
  if (!parsed.success) return null;
  if (!isEnabledType(parsed.data.type)) return null;

  return {
    sourceType: parsed.data.type,
    sourceId: parsed.data.id,
    limit: parsed.data.limit,
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
    const params = parseDebugParams(request.nextUrl.searchParams);
    if (!params) {
      return createErrorResponse("Missing required parameters: type and id", 400);
    }

    const { sourceType, sourceId, limit } = params;
    const sourceDomain: ContentEmbeddingDomain = sourceType;
    const hasSourceEmbedding = await sourceEmbeddingExists({
      sourceDomain,
      sourceId,
    });
    if (!hasSourceEmbedding) {
      return createErrorResponse(`Source embedding not found for: ${sourceType}/${sourceId}`, 404);
    }
    const startMs = performance.now();

    // Step 1: pgvector ANN search — raw cosine candidates
    const rawCandidates = await findSimilarByEntity({
      sourceDomain,
      sourceId,
      limit: Math.min(limit, MAX_LIMIT),
    });
    const annMs = performance.now();

    // Step 2: blended scoring (cosine + recency + diversity + quality + tag overlap)
    const scored = applyBlendedScoring(rawCandidates, {
      sourceDomain,
      maxPerDomain: 10,
      maxTotal: limit,
    });
    const blendMs = performance.now();

    // Step 3: hydrate scored candidates into display-ready items
    const hydrated = await hydrateRelatedContent(scored);
    const hydrateMs = performance.now();

    // Group by domain for statistics
    const byDomain: Record<string, number> = {};
    for (const c of rawCandidates) {
      byDomain[c.domain] = (byDomain[c.domain] ?? 0) + 1;
    }

    return NextResponse.json(
      {
        source: { type: sourceType, id: sourceId },
        timing: {
          annSearchMs: Math.round(annMs - startMs),
          blendedScoringMs: Math.round(blendMs - annMs),
          hydrationMs: Math.round(hydrateMs - blendMs),
          totalMs: Math.round(hydrateMs - startMs),
        },
        statistics: {
          rawCandidateCount: rawCandidates.length,
          scoredCount: scored.length,
          hydratedCount: hydrated.length,
          byDomain,
        },
        pipeline: {
          rawCandidates: rawCandidates.slice(0, 10).map((c) => ({
            domain: c.domain,
            entityId: c.entityId,
            title: c.title,
            cosineSimilarity: c.similarity,
            tagOverlap: c.tagOverlap ?? null,
          })),
          scoredCandidates: scored.slice(0, 10).map((s) => ({
            domain: s.domain,
            entityId: s.entityId,
            title: s.title,
            cosineSimilarity: s.similarity,
            tagOverlap: s.tagOverlap ?? null,
            blendedScore: s.score,
          })),
          hydratedItems: hydrated.slice(0, 10),
        },
        debug: {
          message:
            "Scores reflect: 0.65 × cosine + 0.10 × recency + 0.05 × diversity + 0.10 × quality + 0.10 × tag alignment",
          interpretation: {
            cosineSimilarity: "0-1 from pgvector HNSW (1 - cosine distance)",
            blendedScore: "0-1 final score after recency and quality adjustments",
            recencyDecay: "Half-life 180 days; no date = 0.5",
            qualitySignal:
              "Bookmark quality proxy from description/favorite/word-count; non-bookmark uses title presence.",
            tagOverlap:
              "Bookmark-only canonical tag Jaccard overlap from bookmark_tag_links + alias mapping.",
          },
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Debug endpoint error:", details);
    const message =
      process.env.NODE_ENV === "development"
        ? `Internal server error: ${details}`
        : "Internal server error";
    return createErrorResponse(message, 500);
  }
}
