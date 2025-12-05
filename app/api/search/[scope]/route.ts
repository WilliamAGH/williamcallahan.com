/**
 * Scoped Search API Route
 *
 * Provides search functionality for specific sections of the site
 * (blog, investments, experience, education, bookmarks).
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBookmarks, searchExperience, searchEducation, searchInvestments, searchProjects } from "@/lib/search";
import { applySearchGuards, createSearchErrorResponse, withNoStoreHeaders } from "@/lib/search/api-guards";
import { coalesceSearchRequest } from "@/lib/utils/search-helpers";
import { validateSearchQuery } from "@/lib/validators/search";
import { type SearchResult, VALID_SCOPES } from "@/types/search";
import { unstable_noStore as noStore } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME, not module load time.
// Module-scope checks are evaluated during build and baked into the bundle,
// causing the endpoint to permanently return empty results!
const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

function resolveRequestUrl(request: NextRequest): URL {
  return new URL(request.url);
}

/**
 * Server-side API route for scoped search.
 *
 * This route handles GET requests to search within a specific section of the site
 * based on the scope parameter.
 *
 * @param request - The HTTP request object.
 * @param params - Route parameters including the search scope.
 * @returns A JSON response containing the search results or an error message.
 */
export async function GET(request: NextRequest, { params }: { params: { scope: string } }) {
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      {
        data: [],
        meta: {
          query: "",
          scope: params.scope.toLowerCase(),
          count: 0,
          timestamp: new Date().toISOString(),
          buildPhase: true,
        },
      },
      { headers: withNoStoreHeaders({ "X-Search-Build-Phase": "true" }) },
    );
  }
  if (typeof noStore === "function") {
    noStore();
  }
  try {
    // Apply rate limiting and memory pressure guards
    const guardResponse = applySearchGuards(request);
    if (guardResponse) return guardResponse;

    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q") ?? "";
    const scopeParam = params.scope.toLowerCase();

    // Validate scope (use VALID_SCOPES directly - "all" scope should use /api/search/all endpoint)
    if (!VALID_SCOPES.includes(scopeParam as (typeof VALID_SCOPES)[number])) {
      return NextResponse.json(
        {
          error: `Invalid search scope: ${params.scope}. Use /api/search/all for site-wide search.`,
          validScopes: VALID_SCOPES,
        },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }

    // Now we know scope is valid - cast to the scoped search type
    const scope = scopeParam as (typeof VALID_SCOPES)[number];

    // Validate and sanitize the query
    const validation = validateSearchQuery(rawQuery);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }

    const query = validation.sanitized;

    // Early exit if sanitized query is empty (e.g., only special chars were stripped)
    if (query.length === 0) {
      return NextResponse.json(
        {
          results: [],
          meta: {
            query: "",
            scope,
            count: 0,
            timestamp: new Date().toISOString(),
          },
        },
        { headers: withNoStoreHeaders() },
      );
    }

    // Perform the appropriate search based on scope with request coalescing
    const coalesceKey = `${scope}:${query}`;
    const results = await coalesceSearchRequest<SearchResult[]>(coalesceKey, async () => {
      switch (scope) {
        case "blog":
        case "posts":
          return searchBlogPostsServerSide(query);
        case "investments":
          return searchInvestments(query);
        case "experience":
          return searchExperience(query);
        case "education":
          return searchEducation(query);
        case "bookmarks":
          return searchBookmarks(query);
        case "projects":
          return searchProjects(query);
        default:
          return [];
      }
    });

    // Return results with metadata
    return NextResponse.json(
      {
        results,
        meta: {
          query: validation.sanitized,
          scope,
          count: results.length,
          timestamp: new Date().toISOString(),
        },
      },
      { headers: withNoStoreHeaders() },
    );
  } catch (unknownErr) {
    // Handle unknown errors safely without unsafe assignments/calls
    const err = unknownErr instanceof Error ? unknownErr : new Error(String(unknownErr));
    console.error(`Scoped search API error for scope ${params.scope}:`, err);
    return createSearchErrorResponse(`Failed to perform ${params.scope} search`, err.message);
  }
}
