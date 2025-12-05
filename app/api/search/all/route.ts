/**
 * Site-Wide Search API Route
 *
 * Aggregates search results from various sections of the site (blog, investments,
 * experience, education, bookmarks) based on a single query.
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBookmarks, searchEducation, searchExperience, searchInvestments, searchProjects } from "@/lib/search";
import { applySearchGuards, createSearchErrorResponse, withNoStoreHeaders } from "@/lib/search/api-guards";
import { coalesceSearchRequest } from "@/lib/utils/search-helpers";
import { validateSearchQuery } from "@/lib/validators/search";
import type { SearchResult } from "@/types/search";
import { unstable_noStore } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME, not module load time.
// Module-scope checks are evaluated during build and baked into the bundle,
// causing the endpoint to permanently return empty results!
const isProductionBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

// Helper to safely extract fulfilled values from Promise.allSettled
function getFulfilled<T>(result: PromiseSettledResult<T>): T | [] {
  return result.status === "fulfilled" ? result.value : [];
}

/**
 * Server-side API route for site-wide search.
 *
 * This route handles GET requests to search across multiple sections of the site
 * (blog, investments, experience, education, bookmarks) based on a single query.
 *
 * @param request - The HTTP request object.
 * @returns A JSON response containing the search results or an error message.
 */
export async function GET(request: NextRequest) {
  if (isProductionBuildPhase()) {
    return NextResponse.json(
      {
        results: [],
        meta: {
          query: "",
          scope: "all",
          count: 0,
          timestamp: new Date().toISOString(),
          buildPhase: true,
        },
      },
      { headers: withNoStoreHeaders({ "X-Search-Build-Phase": "true" }) },
    );
  }
  const disableCache = unstable_noStore as (() => void) | undefined;
  if (typeof disableCache === "function") {
    disableCache();
  }
  try {
    // Apply rate limiting and memory pressure guards
    const guardResponse = applySearchGuards(request);
    if (guardResponse) return guardResponse;

    const rawQuery = request.nextUrl.searchParams.get("q");

    // Validate and sanitize the query
    const validation = validateSearchQuery(rawQuery);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        {
          status: 400,
          headers: withNoStoreHeaders(),
        },
      );
    }

    const query = validation.sanitized;

    // Early exit if the sanitized query is empty
    if (query.length === 0) {
      return NextResponse.json(
        {
          results: [],
          meta: {
            query: "",
            scope: "all",
            count: 0,
            timestamp: new Date().toISOString(),
          },
        },
        { headers: withNoStoreHeaders() },
      );
    }

    // Perform site-wide search with request coalescing
    const results = await coalesceSearchRequest<SearchResult[]>(`all:${query}`, async () => {
      // Perform searches in parallel but tolerate failures in any individual search source
      const settled = await Promise.allSettled([
        searchBlogPostsServerSide(query),
        searchInvestments(query),
        searchExperience(query),
        searchEducation(query),
        searchBookmarks(query),
        searchProjects(query),
      ]);

      const [blogResults, investmentResults, experienceResults, educationResults, bookmarkResults, projectResults] =
        settled.map(getFulfilled) as [
          SearchResult[],
          SearchResult[],
          SearchResult[],
          SearchResult[],
          SearchResult[],
          SearchResult[],
        ];

      // Add category prefixes for clarity in terminal (single source of truth for all prefixes)
      const prefixedBlogResults = blogResults.map(r => ({ ...r, title: `[Blog] ${r.title}` }));
      const prefixedInvestmentResults = investmentResults.map(r => ({ ...r, title: `[Investments] ${r.title}` }));
      const prefixedExperienceResults = experienceResults.map(r => ({ ...r, title: `[Experience] ${r.title}` }));
      const prefixedEducationResults = educationResults.map(r => ({ ...r, title: `[Education] ${r.title}` }));
      const prefixedBookmarkResults = bookmarkResults.map(r => ({ ...r, title: `[Bookmark] ${r.title}` }));
      const prefixedProjectResults = projectResults.map(r => ({ ...r, title: `[Projects] ${r.title}` }));

      // Limit results per category to prevent memory explosion
      const MAX_RESULTS_PER_CATEGORY = 24;
      const MAX_TOTAL_RESULTS = 50;

      // Combine all results with limits
      const combined = [
        ...prefixedBlogResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedInvestmentResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedExperienceResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedEducationResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedBookmarkResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedProjectResults.slice(0, MAX_RESULTS_PER_CATEGORY),
      ];

      // Sort by relevance score (highest first) then limit total results
      return combined.toSorted((a, b) => b.score - a.score).slice(0, MAX_TOTAL_RESULTS);
    });

    return NextResponse.json(
      {
        results,
        meta: {
          query,
          scope: "all",
          count: results.length,
          timestamp: new Date().toISOString(),
        },
      },
      { headers: withNoStoreHeaders() },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Site-wide search API error:", errorMessage);
    return createSearchErrorResponse("Failed to perform site-wide search", errorMessage);
  }
}
