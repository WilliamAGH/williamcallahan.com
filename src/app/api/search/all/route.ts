/**
 * Site-Wide Search API Route
 *
 * Aggregates search results from various sections of the site (blog, investments,
 * experience, education, bookmarks) based on a single query.
 *
 * Query parameters:
 * - q: Search query string (required)
 * - scope: Comma-separated list of sources to search (optional)
 *   Valid scopes: blog, investments, experience, education, bookmarks, projects, books, thoughts, tags
 *   Example: ?q=react&scope=blog,projects
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import {
  searchBookmarks,
  searchEducation,
  searchExperience,
  searchInvestments,
  searchProjects,
  searchBooks,
  searchThoughts,
  searchTags,
} from "@/lib/search";
import {
  applySearchGuards,
  createSearchErrorResponse,
  withNoStoreHeaders,
} from "@/lib/search/api-guards";
import { coalesceSearchRequest } from "@/lib/utils/search-helpers";
import { preventCaching } from "@/lib/utils/api-utils";
import { validateSearchQuery } from "@/lib/validators/search";
import { VALID_SCOPES, type SearchResult, type SearchScope } from "@/types/search";
import { NextResponse, connection, type NextRequest } from "next/server";

// CRITICAL: Check build phase AT RUNTIME using dynamic property access.
// Direct property access (process.env.NEXT_PHASE) gets inlined by Turbopack/webpack
// during build, permanently baking "phase-production-build" into the bundle.
// Using bracket notation with a variable key prevents static analysis and inlining.
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isProductionBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

// Per-source timeout in milliseconds (prevents slow sources from blocking entire search)
// Note: Cold starts require S3 index loading which can take 2-8+ seconds depending on:
//   - S3 latency and index size
//   - Slug mapping load time
//   - Memory pressure conditions
// Default increased to 20 seconds to handle worst-case cold starts.
// Override via SEARCH_SOURCE_TIMEOUT_MS environment variable if needed.
const SOURCE_TIMEOUT_MS = Number(process.env.SEARCH_SOURCE_TIMEOUT_MS) || 20_000;

/**
 * Wraps a promise with a timeout. Returns empty array if timeout is exceeded.
 * This prevents slow external services (e.g., Audiobookshelf) from blocking the entire search.
 */
async function withTimeout<T>(
  promise: Promise<T[]>,
  timeoutMs: number,
  sourceName: string,
): Promise<T[]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T[]>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Search] ${sourceName} search timed out after ${timeoutMs}ms`);
      resolve([]);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    // Clear timeout to prevent spurious warning logs when the actual search wins the race
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

// Helper to safely extract fulfilled values from Promise.allSettled
function getFulfilled<T>(result: PromiseSettledResult<T>): T | [] {
  return result.status === "fulfilled" ? result.value : [];
}

/**
 * Parse and validate scope parameter.
 * Returns null to search all scopes, or a Set of specific scopes to search.
 */
function parseScopes(scopeParam: string | null): Set<SearchScope> | null {
  if (!scopeParam) return null; // null = search all

  const requestedScopes = scopeParam
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  const validScopes = new Set<SearchScope>();

  for (const scope of requestedScopes) {
    // Check if scope is in VALID_SCOPES array (excludes "all" which uses this route)
    if ((VALID_SCOPES as readonly string[]).includes(scope)) {
      validScopes.add(scope as SearchScope);
    }
  }

  return validScopes.size > 0 ? validScopes : null;
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
  // connection(): ensure this handler stays request-time under cacheComponents
  await connection();
  // CRITICAL: Call preventCaching() FIRST to prevent Next.js from caching ANY response
  // If called after the build phase check, the buildPhase:true response gets cached
  preventCaching();
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

    // Parse optional scope parameter
    const scopeParam = request.nextUrl.searchParams.get("scope");
    const scopes = parseScopes(scopeParam);
    const shouldSearch = (scope: SearchScope): boolean => scopes === null || scopes.has(scope);

    // Early exit if the sanitized query is empty
    if (query.length === 0) {
      return NextResponse.json(
        {
          results: [],
          meta: {
            query: "",
            scope: scopes ? Array.from(scopes).join(",") : "all",
            count: 0,
            timestamp: new Date().toISOString(),
          },
        },
        { headers: withNoStoreHeaders() },
      );
    }

    // Build cache key including scope for proper coalescing
    const scopeKey = scopes ? Array.from(scopes).toSorted().join(",") : "all";
    const cacheKey = `${scopeKey}:${query}`;

    // Perform site-wide search with request coalescing
    const results = await coalesceSearchRequest<SearchResult[]>(cacheKey, async () => {
      // Only run searches for requested scopes (or all if no scope specified)
      // Each search is wrapped with a timeout to prevent slow sources from blocking
      // Note: "posts" is an alias for "blog" (handled identically to scoped route)
      const settled = await Promise.allSettled([
        shouldSearch("blog") || shouldSearch("posts")
          ? withTimeout(searchBlogPostsServerSide(query), SOURCE_TIMEOUT_MS, "blog")
          : Promise.resolve([]),
        shouldSearch("investments")
          ? withTimeout(searchInvestments(query), SOURCE_TIMEOUT_MS, "investments")
          : Promise.resolve([]),
        shouldSearch("experience")
          ? withTimeout(searchExperience(query), SOURCE_TIMEOUT_MS, "experience")
          : Promise.resolve([]),
        shouldSearch("education")
          ? withTimeout(searchEducation(query), SOURCE_TIMEOUT_MS, "education")
          : Promise.resolve([]),
        shouldSearch("bookmarks")
          ? withTimeout(searchBookmarks(query), SOURCE_TIMEOUT_MS, "bookmarks")
          : Promise.resolve([]),
        shouldSearch("projects")
          ? withTimeout(searchProjects(query), SOURCE_TIMEOUT_MS, "projects")
          : Promise.resolve([]),
        shouldSearch("books")
          ? withTimeout(searchBooks(query), SOURCE_TIMEOUT_MS, "books")
          : Promise.resolve([]),
        shouldSearch("thoughts")
          ? withTimeout(searchThoughts(query), SOURCE_TIMEOUT_MS, "thoughts")
          : Promise.resolve([]),
        shouldSearch("tags")
          ? withTimeout(searchTags(query), SOURCE_TIMEOUT_MS, "tags")
          : Promise.resolve([]),
      ]);

      const [
        blogResults,
        investmentResults,
        experienceResults,
        educationResults,
        bookmarkResults,
        projectResults,
        bookResults,
        thoughtResults,
        tagResults,
      ] = settled.map(getFulfilled) as [
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
        SearchResult[],
      ];

      // Add category prefixes for clarity in terminal (single source of truth for all prefixes)
      const prefixedBlogResults = blogResults.map((r) => ({ ...r, title: `[Blog] ${r.title}` }));
      const prefixedInvestmentResults = investmentResults.map((r) => ({
        ...r,
        title: `[Investments] ${r.title}`,
      }));
      const prefixedExperienceResults = experienceResults.map((r) => ({
        ...r,
        title: `[Experience] ${r.title}`,
      }));
      const prefixedEducationResults = educationResults.map((r) => ({
        ...r,
        title: `[Education] ${r.title}`,
      }));
      const prefixedBookmarkResults = bookmarkResults.map((r) => ({
        ...r,
        title: `[Bookmark] ${r.title}`,
      }));
      const prefixedProjectResults = projectResults.map((r) => ({
        ...r,
        title: `[Projects] ${r.title}`,
      }));
      const prefixedBookResults = bookResults.map((r) => ({ ...r, title: `[Books] ${r.title}` }));
      const prefixedThoughtResults = thoughtResults.map((r) => ({
        ...r,
        title: `[Thoughts] ${r.title}`,
      }));
      // Tag results already have hierarchical format: [Blog] > [Tags] > React
      // No additional prefix needed

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
        ...prefixedBookResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...prefixedThoughtResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ...tagResults.slice(0, MAX_RESULTS_PER_CATEGORY),
      ];

      // Sort by relevance score (highest first) then limit total results
      return combined.toSorted((a, b) => b.score - a.score).slice(0, MAX_TOTAL_RESULTS);
    });

    return NextResponse.json(
      {
        results,
        meta: {
          query,
          scope: scopeKey,
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
