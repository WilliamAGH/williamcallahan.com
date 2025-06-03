/**
 * Bookmarks Refresh API Route
 *
 * Provides a public API endpoint for refreshing the bookmarks cache.
 * This endpoint is rate-limited to prevent abuse.
 */

import { NextResponse } from 'next/server';
import { refreshBookmarksData } from '@/lib/bookmarks';
import { ServerCacheInstance } from '@/lib/server-cache';

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

// In-memory rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 5; // 5 requests per window

// Simple in-memory rate limiting
// Rate limiting implementation - consider replacing with distributed solution for multi-instance deployments
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
export async function POST(request: Request): Promise<NextResponse> {
  const authorizationHeader = request.headers.get('Authorization');
  const cronRefreshSecret = process.env.BOOKMARK_CRON_REFRESH_SECRET;
  let isCronJob = false;

  if (cronRefreshSecret && authorizationHeader && authorizationHeader.startsWith('Bearer ')) {
    const token = authorizationHeader.substring(7); // Remove "Bearer " prefix
    if (token === cronRefreshSecret) {
      isCronJob = true;
      console.log('[API Bookmarks Refresh] Authenticated as cron job via BOOKMARK_CRON_REFRESH_SECRET.');
    }
  }

  // Get client IP for rate limiting (only if not an authenticated cron job)
  if (!isCronJob) {
    const forwardedFor: string = request.headers.get('x-forwarded-for') || 'unknown';
    const clientIp = forwardedFor?.split(',')[0]?.trim() || '';
    if (!checkRateLimit(clientIp)) {
      return NextResponse.json({
        error: 'Rate limit exceeded. Try again later.'
      }, { status: 429 });
    }
  }

  try {
    // For cron jobs, always refresh. For others, check if refresh is needed.
    if (!isCronJob && !ServerCacheInstance.shouldRefreshBookmarks()) {
      const cached = ServerCacheInstance.getBookmarks();
      console.log('[API Bookmarks Refresh] Regular request: Cache is already up to date.');
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

    if (isCronJob) {
      console.log('[API Bookmarks Refresh] Cron job: Forcing bookmark data refresh.');
    } else {
      console.log('[API Bookmarks Refresh] Regular request: Refreshing bookmarks data as cache is stale or needs update.');
    }

    const bookmarks = await refreshBookmarksData();

    return NextResponse.json({
      status: 'success',
      message: `Bookmarks cache refreshed successfully${isCronJob ? ' (triggered by cron)' : ''}`,
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
export async function GET(): Promise<NextResponse> {
  // Use Promise.resolve to satisfy require-await rule
  const cached = await Promise.resolve(ServerCacheInstance.getBookmarks());
  const needsRefresh = await Promise.resolve(ServerCacheInstance.shouldRefreshBookmarks());

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