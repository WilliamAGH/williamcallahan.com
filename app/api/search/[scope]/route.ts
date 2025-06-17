/**
 * Scoped Search API Route
 *
 * Provides search functionality for specific sections of the site
 * (blog, investments, experience, education, bookmarks).
 */

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";
import {
  searchBookmarks,
  searchExperience,
  searchEducation,
  searchInvestments,
} from "@/lib/search";
import { validateSearchQuery } from "@/lib/validators/search";
import type { SearchResult } from "@/types/search";
import { NextResponse } from "next/server";

// Ensure this route is not statically cached
export const dynamic = "force-dynamic";

// Valid search scopes
const VALID_SCOPES = ["blog", "posts", "investments", "experience", "education", "bookmarks"] as const;
type SearchScope = typeof VALID_SCOPES[number];

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
export async function GET(
  request: Request,
  { params }: { params: { scope: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q") ?? "";
    const scope = params.scope.toLowerCase() as SearchScope;

    // Validate scope
    if (!VALID_SCOPES.includes(scope)) {
      return NextResponse.json(
        { 
          error: `Invalid search scope: ${params.scope}`,
          validScopes: VALID_SCOPES 
        },
        { status: 400 }
      );
    }

    // Validate and sanitize the query
    const validation = validateSearchQuery(rawQuery);
    
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error || "Invalid search query" },
        { status: 400 }
      );
    }

    const query = validation.sanitized;

    // Perform the appropriate search based on scope
    let results: SearchResult[] = [];

    switch (scope) {
      case "blog":
      case "posts":
        // Use server-side blog search for blog/posts
        results = await searchBlogPostsServerSide(query);
        break;
      case "investments":
        results = searchInvestments(query);
        break;
      case "experience":
        results = searchExperience(query);
        break;
      case "education":
        results = searchEducation(query);
        break;
      case "bookmarks":
        results = await searchBookmarks(query);
        break;
    }

    // Return results with metadata
    return NextResponse.json({
      results,
      meta: {
        query: validation.sanitized,
        scope,
        count: results.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error(`Scoped search API error for scope ${params.scope}:`, error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json(
      { 
        error: "Failed to perform search", 
        details: errorMessage,
        scope: params.scope 
      },
      { status: 500 }
    );
  }
}