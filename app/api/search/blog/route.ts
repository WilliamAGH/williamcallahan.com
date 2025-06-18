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

import { searchBlogPostsServerSide } from "@/lib/blog/server-search"; // Import the refactored search function
import { NextResponse } from "next/server";
// import type { SearchResult } from '@/types/search'; // Keep SearchResult type - Removed as unused by ESLint

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

/**
 * Server-side API route for blog search.
 *
 * This route handles GET requests to search for blog posts based on a query.
 * It extracts the search query from the request URL parameters and passes it
 * to the server-side search function. The results are then returned as a JSON
 * response.
 *
 * @param request - The HTTP request object.
 * @returns A JSON response containing the search results or an error message.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");

    if (!query) {
      return NextResponse.json(
        { error: 'Search query parameter "q" is required' },
        { status: 400 },
      );
    }

    // Call the imported server-side search function
    const searchResults = await searchBlogPostsServerSide(query);

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error("Blog search API error:", error);
    // Determine if it's a known error type or generic
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { error: "Failed to perform blog search", details: errorMessage },
      { status: 500 },
    );
  }
}
