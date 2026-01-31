/**
 * Posts API Route
 */

import { getAllPosts } from "@/lib/blog";
import { cacheContextGuards } from "@/lib/cache";
import { sanitizeBlogPosts, sanitizeError } from "@/lib/utils/api-sanitization";
import { NextResponse } from "next/server";

// Cache posts in Cache Components mode; route handlers remain dynamic.
const getCachedPosts = async () => {
  "use cache";
  cacheContextGuards.cacheLife("PostsAPI", "hours");
  return getAllPosts();
};

/**
 * Formats error details for API response
 * In production, this will omit sensitive information
 */
function formatErrorResponse(error: unknown) {
  return sanitizeError(error, false); // Never include stack traces in posts API
}

// GET handler for blog posts
export async function GET() {
  try {
    const posts = await getCachedPosts();

    // Sanitize posts to remove sensitive fields (filePath, rawContent, etc.)
    const sanitizedPosts = sanitizeBlogPosts(posts);

    // Determine if we're in development mode
    const isDev = process.env.NODE_ENV === "development";

    // Set different headers based on environment
    const headers = isDev
      ? { "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" }
      : { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" };

    return NextResponse.json(
      {
        posts: sanitizedPosts,
        count: sanitizedPosts.length,
      },
      { headers },
    );
  } catch (error) {
    const formattedError = formatErrorResponse(error);

    return NextResponse.json(
      {
        error: formattedError,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      },
    );
  }
}
