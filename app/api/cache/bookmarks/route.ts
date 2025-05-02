/**
 * Bookmarks Cache API Route
 *
 * Provides API endpoints for managing the bookmarks cache.
 * - GET: Returns the current status of the bookmarks cache
 * - POST: Forces a refresh of the bookmarks cache
 * - DELETE: Clears the bookmarks cache
 */

import { NextResponse } from 'next/server';
import { fetchExternalBookmarks } from '@/lib/bookmarks';
import { ServerCacheInstance } from '@/lib/server-cache';

// Ensure this route is not statically cached
export const dynamic = 'force-dynamic';

/**
 * API Key validation middleware
 * @param request - The HTTP request
 * @returns Boolean indicating if the request has a valid API key
 */
function validateApiKey(request: Request): boolean {
  const apiKey = process.env.ADMIN_API_KEY;
  if (!apiKey) return false;
  
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return false;
  
  // Check 'Bearer TOKEN' format
  const [type, token] = authHeader.split(' ');
  if (type !== 'Bearer' || !token) return false;
  
  return token === apiKey;
}

/**
 * GET handler - Returns current status of the bookmarks cache
 */
export async function GET(request: Request) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cached = ServerCacheInstance.getBookmarks();
  
  return NextResponse.json({
    status: 'success',
    data: {
      cached: !!cached,
      bookmarksCount: cached?.bookmarks.length || 0,
      lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null,
      lastAttemptedAt: cached?.lastAttemptedAt ? new Date(cached.lastAttemptedAt).toISOString() : null,
      needsRefresh: ServerCacheInstance.shouldRefreshBookmarks()
    }
  });
}

/**
 * POST handler - Forces a refresh of the bookmarks cache
 */
export async function POST(request: Request) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    // Forcibly refresh by calling the actual API
    const { refreshBookmarksData } = await import('@/lib/bookmarks');
    await refreshBookmarksData();
    
    const cached = ServerCacheInstance.getBookmarks();
    
    return NextResponse.json({
      status: 'success',
      message: 'Bookmarks cache refreshed successfully',
      data: {
        bookmarksCount: cached?.bookmarks.length || 0,
        lastFetchedAt: cached?.lastFetchedAt ? new Date(cached.lastFetchedAt).toISOString() : null
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
 * DELETE handler - Clears the bookmarks cache
 */
export async function DELETE(request: Request) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  try {
    ServerCacheInstance.clearBookmarks();
    
    return NextResponse.json({
      status: 'success',
      message: 'Bookmarks cache cleared successfully'
    });
  } catch (error) {
    console.error('Failed to clear bookmarks cache:', error);
    return NextResponse.json({
      status: 'error',
      message: 'Failed to clear bookmarks cache',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}