/**
 * Scoped Search API Route
 *
 * Provides search functionality for specific sections of the site
 * (blog, investments, experience, education, bookmarks).
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBookmarks, searchExperience, searchEducation, searchInvestments, searchProjects } from "@/lib/search";
import { validateSearchQuery } from "@/lib/validators/search";
import { type SearchResult, type SearchScope, VALID_SCOPES } from "@/types/search";
import { unstable_noStore as noStore } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

const NO_STORE_HEADERS: HeadersInit = { "Cache-Control": "no-store" };
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

function resolveRequestUrl(request: NextRequest): URL {
  return new URL(request.url);
}

const ALL_VALID_SCOPES = [...VALID_SCOPES, "all"];

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
  if (isProductionBuild) {
    return NextResponse.json(
      {
        results: [],
        meta: {
          query: "",
          scope: params.scope.toLowerCase(),
          count: 0,
          timestamp: new Date().toISOString(),
          buildPhase: true,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  }
  noStore();
  try {
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q") ?? "";
    const scope = params.scope.toLowerCase() as SearchScope;

    // Validate scope
    if (!ALL_VALID_SCOPES.includes(scope)) {
      return NextResponse.json(
        {
          error: `Invalid search scope: ${params.scope}`,
          validScopes: ALL_VALID_SCOPES,
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // Validate and sanitize the query
    const validation = validateSearchQuery(rawQuery);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    const query = validation.sanitized;

    // Perform the appropriate search based on scope
    let results: SearchResult[] = [];

    switch (scope) {
      case "blog":
      case "posts":
        // Use searchPosts function
        results = await searchBlogPostsServerSide(query);
        break;
      case "investments":
        results = await searchInvestments(query);
        break;
      case "experience":
        results = await searchExperience(query);
        break;
      case "education":
        results = await searchEducation(query);
        break;
      case "bookmarks":
        results = await searchBookmarks(query);
        break;
      case "projects":
        results = await searchProjects(query);
        break;
      case "all": {
        // Search across all scopes and aggregate results
        const [blogResults, investmentResults, experienceResults, educationResults, bookmarkResults] =
          await Promise.all([
            searchBlogPostsServerSide(query),
            searchInvestments(query),
            searchExperience(query),
            searchEducation(query),
            searchBookmarks(query),
          ]);

        // Combine all results and sort by score (highest first)
        results = [
          ...blogResults,
          ...investmentResults,
          ...experienceResults,
          ...educationResults,
          ...bookmarkResults,
        ].toSorted((a, b) => b.score - a.score);
        break;
      }
    }

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
      { headers: NO_STORE_HEADERS },
    );
  } catch (unknownErr) {
    // Handle unknown errors safely without unsafe assignments/calls
    const err = unknownErr instanceof Error ? unknownErr : new Error(String(unknownErr));
    console.error(`Scoped search API error for scope ${params.scope}:`, err);

    return NextResponse.json(
      {
        error: "Failed to perform search",
        details: err.message,
        scope: params.scope,
      },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
