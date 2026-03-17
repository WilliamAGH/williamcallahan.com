/**
 * Bookmarks-only Search API Route
 *
 * GET /api/search/bookmarks?q=<query>
 * Returns dual payload shapes for compatibility:
 * - `data`: hydrated `UnifiedBookmark[]` for bookmark-focused consumers
 * - `results`: normalized `SearchResult[]` for terminal scoped-search parsing
 *
 * In production: hybrid search (FTS + trigram + pgvector semantic similarity).
 * Fallback: FTS-only search when hybrid is unavailable.
 */

import {
  applySearchGuards,
  createSearchErrorResponse,
  withNoStoreHeaders,
} from "@/lib/search/api-guards";
import { validateSearchQuery } from "@/lib/validators/search";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";
import type { BookmarkFtsSearchHit, BookmarkFtsSearchPageResult } from "@/types/db/bookmarks";
import type { SearchResult } from "@/types/schemas/search";
import { bookmarkSearchParamsSchema } from "@/types/schemas/search";
import { preventCaching } from "@/lib/utils/api-utils";
import { NextResponse, connection, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const loadBookmarkQueryModule = async () => import("@/lib/db/queries/bookmarks");
const loadHybridSearchModule = async () => import("@/lib/db/queries/hybrid-search");
const loadEmbeddingModule = async () => import("@/lib/ai/openai-compatible/embeddings-client");
const loadEmbeddingConfig = async () => import("@/lib/ai/openai-compatible/feature-config");
const loadEmbeddingDimensions = async () => import("@/lib/db/schema/content-embeddings");

const HYBRID_CANDIDATE_LIMIT = 100;

/** Pagination-only slice of the bookmark search params schema. */
const paginationSchema = bookmarkSearchParamsSchema.pick({ page: true, limit: true });

/** Build the standard bookmark search response payload. */
function buildBookmarkSearchResponse(params: {
  data: UnifiedBookmark[];
  results: SearchResult[];
  totalCount: number;
  hasMore: boolean;
  query: string;
  buildPhase?: boolean;
}): NextResponse {
  const { data, results, totalCount, hasMore, query, buildPhase } = params;
  return NextResponse.json(
    {
      data,
      results,
      totalCount,
      hasMore,
      meta: {
        query,
        scope: "bookmarks",
        count: results.length,
        timestamp: new Date().toISOString(),
        ...(buildPhase ? { buildPhase: true } : {}),
      },
    },
    { headers: withNoStoreHeaders() },
  );
}

/** Map a ranked bookmark row into a normalized SearchResult. */
function toBookmarkSearchResult(bookmark: UnifiedBookmark, score: number): SearchResult {
  const fallbackUrl = bookmark.slug ? `/bookmarks/${bookmark.slug}` : `/bookmarks/${bookmark.id}`;
  return {
    id: bookmark.id,
    type: "bookmark",
    title: bookmark.title,
    description: bookmark.description,
    url: fallbackUrl,
    score,
  };
}

async function tryHybridSearch(query: string): Promise<BookmarkFtsSearchHit[] | null> {
  if (process.env.NODE_ENV !== "production") return null;

  try {
    const [{ hybridSearchBookmarks }, embClient, embConfig, schema] = await Promise.all([
      loadHybridSearchModule(),
      loadEmbeddingModule(),
      loadEmbeddingConfig(),
      loadEmbeddingDimensions(),
    ]);

    const config = embConfig.resolveDefaultEndpointCompatibleEmbeddingConfig();
    let embedding: number[] | undefined;
    if (config) {
      try {
        const vectors = await embClient.embedTextsWithEndpointCompatibleModel({
          config,
          input: [query],
          timeoutMs: 1_500,
        });
        const vec = vectors[0];
        if (vec && vec.length === schema.CONTENT_EMBEDDING_DIMENSIONS) {
          embedding = vec;
        }
      } catch {
        // Embedding generation failed; hybrid continues with keyword-only scoring
      }
    }

    return hybridSearchBookmarks({ query, embedding, limit: HYBRID_CANDIDATE_LIMIT });
  } catch (error: unknown) {
    console.error("[BookmarksSearchRoute] Hybrid search module load or execution failed:", error);
    return null;
  }
}

async function executeHybridOrFtsSearch(
  query: string,
  page: number,
  limit: number,
): Promise<BookmarkFtsSearchPageResult> {
  const hybridHits = await tryHybridSearch(query);
  if (hybridHits) {
    const start = (page - 1) * limit;
    return {
      items: hybridHits.slice(start, start + limit),
      totalCount: hybridHits.length,
    };
  }

  const { searchBookmarksFtsPage } = await loadBookmarkQueryModule();
  return searchBookmarksFtsPage(query, page, limit);
}

function resolveRequestUrl(request: NextRequest | { nextUrl?: URL; url: string }): URL {
  if ("nextUrl" in request && request.nextUrl instanceof URL) {
    return request.nextUrl;
  }
  return new URL(request.url);
}

export async function GET(request: NextRequest) {
  // connection(): ensure request-time execution under cacheComponents to avoid prerendered buildPhase responses
  await connection();
  // CRITICAL: Call preventCaching() FIRST to prevent Next.js from caching ANY response
  // If called after the build phase check, the buildPhase:true response gets cached
  preventCaching();
  if (isProductionBuildPhase()) {
    return buildBookmarkSearchResponse({
      data: [],
      results: [],
      totalCount: 0,
      hasMore: false,
      query: "",
      buildPhase: true,
    });
  }
  try {
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q");

    // Apply request guards (rate limiting)
    const guardResponse = applySearchGuards(request);
    if (guardResponse) return guardResponse;

    // Sanitize / validate like other search routes
    const validation = validateSearchQuery(rawQuery);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }

    const query = validation.sanitized;
    if (query.length === 0) {
      return buildBookmarkSearchResponse({
        data: [],
        results: [],
        totalCount: 0,
        hasMore: false,
        query,
      });
    }

    // Validate pagination via the canonical Zod schema (coerces, bounds-checks, defaults)
    const paginationInput = {
      ...(searchParams.get("page") != null && { page: searchParams.get("page") }),
      ...(searchParams.get("limit") != null && { limit: searchParams.get("limit") }),
    };
    const paginationResult = paginationSchema.safeParse(paginationInput);
    if (!paginationResult.success) {
      return NextResponse.json(
        { error: "Invalid pagination parameters" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }
    const { page, limit } = paginationResult.data;

    const allItems = await executeHybridOrFtsSearch(query, page, limit);
    const start = (page - 1) * limit;

    return buildBookmarkSearchResponse({
      data: allItems.items.map((item) => item.bookmark),
      results: allItems.items.map((item) => toBookmarkSearchResult(item.bookmark, item.score)),
      totalCount: allItems.totalCount,
      hasMore: start + limit < allItems.totalCount,
      query,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Bookmarks Search API]", err);
    return createSearchErrorResponse("Bookmarks search failed", message);
  }
}
