/**
 * Posts API Route
 */

import { NextResponse } from 'next/server';
import { getAllPosts } from '@/lib/blog';

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

export async function GET() {
  try {
    const posts = await getAllPosts();

    // Return empty array instead of throwing if no posts found
    if (!posts || posts.length === 0) {
      console.warn('No blog posts found');
    }

    return NextResponse.json(posts || []);
  } catch (error) {
    console.error('Error fetching posts:', error);

    const errorDetails = formatErrorResponse(error);

    return NextResponse.json(
      {
        error: 'Failed to fetch blog posts',
        details: errorDetails
      },
      { status: 500 }
    );
  }
}
