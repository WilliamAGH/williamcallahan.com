/**
 * Blog Search API Route
 *
 * This route provides a server-side search endpoint for blog posts.
 * It allows clients to search through blog posts by title, excerpt, tags,
 * and author name. The results are formatted as SearchResult objects
 * for use in the terminal search interface.
 *
 * @see {@link lib/search.ts} For the client-side search implementation
 * @see {@link components/features/blog/blog-window.client.tsx} For the terminal search UI
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import { createSearchErrorResponse, withNoStoreHeaders } from "@/lib/search/api-guards";
import { validateSearchQuery } from "@/lib/validators/search";
import { unstable_noStore as noStore } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
const isProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

function resolveRequestUrl(request: NextRequest): URL {
  return request.nextUrl;
}

/**
 * Server-side API route for blog search.
 *
 * This route handles GET requests to search for blog posts based on a query.
 * It extracts and sanitizes the search query via validateSearchQuery to prevent
 * whitespace-only or malicious input before delegating to the server-side search
 * function. The results are then returned as a JSON response.
 *
 * @param request - The HTTP request object.
 * @returns A JSON response containing the search results or an error message.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (isProductionBuild) {
    return NextResponse.json([], { headers: withNoStoreHeaders() });
  }
  if (typeof noStore === "function") {
    noStore();
  }
  try {
    const requestUrl = resolveRequestUrl(request);
    const searchParams = requestUrl.searchParams;
    const rawQuery = searchParams.get("q");
    const validation = validateSearchQuery(rawQuery);

    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        { status: 400, headers: withNoStoreHeaders() },
      );
    }

    const query = validation.sanitized;

    // Call the imported server-side search function with sanitized input to prevent whitespace bypasses
    const searchResults = await searchBlogPostsServerSide(query);

    return NextResponse.json(searchResults, { headers: withNoStoreHeaders() });
  } catch (error) {
    console.error("Blog search API error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return createSearchErrorResponse("Failed to perform blog search", errorMessage);
  }
}
