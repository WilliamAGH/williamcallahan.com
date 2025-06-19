/**
 * Site-Wide Search API Route
 *
 * Aggregates search results from various sections of the site (blog, investments,
 * experience, education, bookmarks) based on a single query.
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { searchBookmarks, searchEducation, searchExperience, searchInvestments } from "@/lib/search";
import { validateSearchQuery } from "@/lib/validators/search";
import type { SearchResult } from "@/types/search";
import { NextResponse } from "next/server";

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

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
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");

    // Validate and sanitize the query
    const validation = validateSearchQuery(rawQuery);

    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error || "Invalid search query" }, { status: 400 });
    }

    const query = validation.sanitized;

    // Early exit if the sanitized query is empty
    if (query.length === 0) {
      return NextResponse.json([]); // Nothing to search for
    }

    // Perform searches in parallel but tolerate failures in any individual search source
    const settled = await Promise.allSettled([
      // Blog search already adds its own [Blog] prefix
      searchBlogPostsServerSide(query),
      Promise.resolve(searchInvestments(query)),
      Promise.resolve(searchExperience(query)),
      Promise.resolve(searchEducation(query)),
      searchBookmarks(query),
    ]);

    const [blogResults, investmentResults, experienceResults, educationResults, bookmarkResults] = settled.map(
      getFulfilled,
    ) as [SearchResult[], SearchResult[], SearchResult[], SearchResult[], SearchResult[]];

    // Add prefixes to non-blog results for clarity in the terminal
    const prefixedInvestmentResults = investmentResults.map((r) => ({
      ...r,
      label: `[Investments] ${r.label}`,
    }));
    const prefixedExperienceResults = experienceResults.map((r) => ({
      ...r,
      label: `[Experience] ${r.label}`,
    }));
    const prefixedEducationResults = educationResults.map((r) => ({
      ...r,
      label: `[Education] ${r.label}`,
    }));
    const prefixedBookmarkResults = bookmarkResults.map((r) => ({
      ...r,
      label: `[Bookmark] ${r.label}`,
    }));

    // Combine all results
    const combinedResults: SearchResult[] = [
      ...blogResults,
      ...prefixedInvestmentResults,
      ...prefixedExperienceResults,
      ...prefixedEducationResults,
      ...prefixedBookmarkResults,
    ];

    // Optional: Sort combined results? Or keep them grouped by section?
    // For now, keeping them grouped might be clearer.

    return NextResponse.json(combinedResults);
  } catch (error) {
    console.error("Site-wide search API error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to perform site-wide search", details: errorMessage }, { status: 500 });
  }
}
