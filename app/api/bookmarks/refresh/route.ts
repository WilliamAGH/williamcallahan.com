/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks cache.
 * This endpoint is rate-limited to prevent abuse.
 */

import { NextResponse } from 'next/server';
import { refreshBookmarksData } from '@/lib/bookmarks.client';
import { ServerCacheInstance } from '@/lib/server-cache';

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

// In-memory rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per window

// Simple in-memory rate limiting
// TODO: Replace this with a distributed rate limiter (e.g., Redis, Upstash) for production scalability.
// In-memory store resets on deploys and doesn't scale horizontally.
const rateLimitStore: { [ip: string]: { count: number; resetAt: number } } = {};

/**
 * Rate limiting middleware
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitStore[ip];

  // If no record exists or window has expired, create a new one
  if (!record || now > record.resetAt) {
    rateLimitStore[ip] = {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW
    };
    return true;
  }

  // Increment count and check if over limit
  record.count++;
  if (record.count > RATE_LIMIT_MAX) {
    return false;
  }

  return true;
}

/**
 * POST handler - Refreshes the bookmarks cache
 */
export async function POST(request: Request) {
  // Get client IP for rate limiting
  const forwardedFor = request.headers.get('x-forwarded-for') || 'unknown';
  // Take first IP if there are multiple
  const clientIp = forwardedFor.split(',')[0].trim();

  // Check rate limit
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json({
      error: 'Rate limit exceeded. Try again later.'
    }, { status: 429 });
  }

  try {
    // Check if refresh is actually needed
    if (!ServerCacheInstance.shouldRefreshBookmarks()) {
      const cached = ServerCacheInstance.getBookmarks();
      return NextResponse.json({
        status: 'success',
        message: 'Bookmarks cache is already up to date',
        data: {
          refreshed: false,
          bookmarksCount: cached?.bookmarks.length || 0,
          lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null
        }
      });
    }

    // Refresh the cache
    const bookmarks = await refreshBookmarksData();

    return NextResponse.json({
      status: 'success',
      message: 'Bookmarks cache refreshed successfully',
      data: {
        refreshed: true,
        bookmarksCount: bookmarks.length
      }
    });
  } catch (error) {
    console.error('Failed to refresh bookmarks cache:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to refresh bookmarks cache',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * GET handler - Check if refresh is needed
 */
export async function GET() {
  const cached = ServerCacheInstance.getBookmarks();
  const needsRefresh = ServerCacheInstance.shouldRefreshBookmarks();

  return NextResponse.json({
    status: 'success',
    data: {
      needsRefresh,
      bookmarksCount: cached?.bookmarks.length || 0,
      lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      lastAttemptedAt: cached?.lastAttemptedAt ? new Date(cached.lastAttemptedAt).toISOString() : null
    }
  });
}