/**
 * Site-Wide Search API Route
 *
 * Aggregates search results from various sections of the site (blog, investments,
 * experience, education, bookmarks) based on a single query.
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBookmarks, searchEducation, searchExperience, searchInvestments, searchProjects } from "@/lib/search";
import { validateSearchQuery } from "@/lib/validators/search";
import { isOperationAllowed } from "@/lib/rate-limiter";
import type { SearchResult } from "@/types/search";
import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import os from "node:os";

const withNoStoreHeaders = (additional?: Record<string, string>): HeadersInit =>
  additional ? { "Cache-Control": "no-store", ...additional } : { "Cache-Control": "no-store" };

const inFlightSearches = new Map<string, Promise<SearchResult[]>>();

function buildAbsoluteUrl(value: string, headersList: Headers): URL {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return new URL(value);
  }
  const protocol = headersList.get("x-forwarded-proto") ?? "https";
  const host = headersList.get("host") ?? "localhost";
  const normalizedPath = value.startsWith("/") ? value : `/${value}`;
  return new URL(`${protocol}://${host}${normalizedPath}`);
}

function resolveRequestContext(request: Request): { url: URL; headersList: Headers } {
  const headersList = request.headers;
  const nextUrlHeader = headersList.get("next-url");
  const url = nextUrlHeader ? buildAbsoluteUrl(nextUrlHeader, headersList) : new URL(request.url);
  return { url, headersList };
}

// ────────────────────────────────────────────────────────────────────────────
// Memory pressure check (adaptive & configurable)
//
// 1. Allows overriding the absolute threshold via `MEMORY_CRITICAL_BYTES`.
// 2. Alternatively, allows a percentage-based threshold via
//    `MEMORY_CRITICAL_PERCENT` (e.g. "90" for 90 % of total RAM).
// 3. Falls back to a sensible default (3 GB) when no override is provided.
//
// This prevents false positives on machines with >3.5 GB RAM while still
// protecting low-memory environments.
// ────────────────────────────────────────────────────────────────────────────

function getCriticalThreshold(): number {
  const bytesEnv = process.env.MEMORY_CRITICAL_BYTES;
  if (bytesEnv && !Number.isNaN(Number(bytesEnv))) {
    return Number(bytesEnv);
  }

  const percentEnv = process.env.MEMORY_CRITICAL_PERCENT;
  if (percentEnv && !Number.isNaN(Number(percentEnv))) {
    const percent = Math.min(Math.max(Number(percentEnv), 1), 99);
    try {
      const total = os.totalmem();
      return (percent / 100) * total;
    } catch {
      /* istanbul ignore next */
      // Fallback handled below
    }
  }

  // Default: 3 GB
  return 3 * 1024 * 1024 * 1024;
}

function isMemoryCritical(): boolean {
  // Disable guard during local development and test runs
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  if (typeof process === "undefined") return false;

  const { rss } = process.memoryUsage();
  return rss > getCriticalThreshold();
}

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
export async function GET(request: Request) {
  noStore();
  try {
    const { url: requestUrl, headersList } = resolveRequestContext(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q");

    // Extract client IP for rate limiting
    const forwardedFor = headersList.get("x-forwarded-for");
    const clientIp = forwardedFor ? forwardedFor.split(",")[0]?.trim() || "anonymous" : "anonymous";

    // Apply rate limiting: 10 searches per minute per IP
    if (!isOperationAllowed("search", clientIp, { maxRequests: 10, windowMs: 60000 })) {
      return NextResponse.json(
        { error: "Too many search requests. Please wait a moment before searching again." },
        {
          status: 429,
          headers: withNoStoreHeaders({
            "Retry-After": "60",
            "X-RateLimit-Limit": "10",
            "X-RateLimit-Window": "60s",
          }),
        },
      );
    }

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
      return NextResponse.json([], { headers: withNoStoreHeaders() }); // Nothing to search for
    }

    // Check for critical memory pressure
    if (isMemoryCritical()) {
      return NextResponse.json(
        { error: "Server is under heavy load. Please try again in a moment." },
        {
          status: 503,
          headers: withNoStoreHeaders({
            "Retry-After": "30",
            "X-Memory-Pressure": "critical",
          }),
        },
      );
    }

    // Check for in-flight search with same query (request coalescing)
    const existingSearch = inFlightSearches.get(query);
    if (existingSearch) {
      console.log(`[Search API] Reusing in-flight search for query: "${query}"`);
      const results = await existingSearch;
      return NextResponse.json(results, { headers: withNoStoreHeaders() });
    }

    // Create new search promise
    const searchPromise = (async () => {
      try {
        // Perform searches in parallel but tolerate failures in any individual search source
        const settled = await Promise.allSettled([
          // Blog search already adds its own [Blog] prefix
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

        // Add prefixes to non-blog results for clarity in the terminal
        const prefixedInvestmentResults = investmentResults.map(r => ({
          ...r,
          title: `[Investments] ${r.title}`,
        }));
        const prefixedExperienceResults = experienceResults.map(r => ({
          ...r,
          title: `[Experience] ${r.title}`,
        }));
        const prefixedEducationResults = educationResults.map(r => ({
          ...r,
          title: `[Education] ${r.title}`,
        }));
        const prefixedBookmarkResults = bookmarkResults.map(r => ({
          ...r,
          title: `[Bookmark] ${r.title}`,
        }));
        const prefixedProjectResults = projectResults.map(r => ({
          ...r,
          title: `[Projects] ${r.title}`,
        }));

        // Limit results per category to prevent memory explosion
        const MAX_RESULTS_PER_CATEGORY = 24;
        const MAX_TOTAL_RESULTS = 50;

        // Combine all results with limits
        const combinedResults: SearchResult[] = [
          ...blogResults.slice(0, MAX_RESULTS_PER_CATEGORY),
          ...prefixedInvestmentResults.slice(0, MAX_RESULTS_PER_CATEGORY),
          ...prefixedExperienceResults.slice(0, MAX_RESULTS_PER_CATEGORY),
          ...prefixedEducationResults.slice(0, MAX_RESULTS_PER_CATEGORY),
          ...prefixedBookmarkResults.slice(0, MAX_RESULTS_PER_CATEGORY),
          ...prefixedProjectResults.slice(0, MAX_RESULTS_PER_CATEGORY),
        ].slice(0, MAX_TOTAL_RESULTS);

        return combinedResults;
      } finally {
        // Always clean up the in-flight search
        inFlightSearches.delete(query);
      }
    })();

    // Store the promise for request coalescing
    inFlightSearches.set(query, searchPromise);

    // Wait for results
    const results = await searchPromise;
    return NextResponse.json(results, { headers: withNoStoreHeaders() });
  } catch (error) {
    console.error("Site-wide search API error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: "Failed to perform site-wide search", details: errorMessage },
      { status: 500, headers: withNoStoreHeaders() },
    );
  }
}
