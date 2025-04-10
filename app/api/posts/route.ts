/**
 * Posts API Route
 */

import { NextResponse } from 'next/server';
import { getAllPosts } from '@/lib/blog';

// Set cache options for API - revalidate every 1 hour (3600 seconds)
export const revalidate = 3600;

/**
 * Formats error details for API response
 * In production, this will omit sensitive information
 */
function formatErrorResponse(error: unknown) {
  const isDev = process.env.NODE_ENV === 'development';

  // Basic error info for any environment
  const errorResponse: Record<string, any> = {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
    code: 'BLOG_FETCH_ERROR'
  };

  // Add detailed debug information in development only
  if (isDev) {
    if (error instanceof Error) {
      errorResponse.stack = error.stack;
      errorResponse.cause = error.cause;

      // Include any custom properties the error might have
      Object.getOwnPropertyNames(error).forEach(prop => {
        if (!['name', 'message', 'stack'].includes(prop)) {
          errorResponse[prop] = (error as any)[prop];
        }
      });
    } else {
      // For non-Error objects, include as much info as possible
      errorResponse.rawError = String(error);
    }
  }

  return errorResponse;
}

// GET handler for blog posts
export async function GET() {
  try {
    const posts = await getAllPosts();

    // Determine if we're in development mode
    const isDev = process.env.NODE_ENV === 'development';

    // Set different headers based on environment
    const headers = isDev
      ? { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' }
      : { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' };

    return NextResponse.json({
      posts,
      count: posts.length
    }, { headers });
  } catch (error) {
    const formattedError = formatErrorResponse(error);

    return NextResponse.json({
      error: formattedError
    }, {
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  }
}
