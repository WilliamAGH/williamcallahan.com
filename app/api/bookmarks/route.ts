/**
 * Bookmarks API Endpoint
 *
 * Provides client-side access to all bookmarks
 */

import { NextResponse } from 'next/server';
import { fetchExternalBookmarks } from '@/lib/bookmarks';
import { ServerCacheInstance } from '@/lib/server-cache';

// This route always bypasses the cache for up-to-date bookmark data
export const dynamic = 'force-dynamic';

/**
 * API route for fetching all bookmarks
 */
export async function GET() {
  let bookmarks;
  try {
    console.log('API route: Starting to fetch bookmarks');
    console.log('API route: Using dynamic rendering with force-dynamic');
    bookmarks = await fetchExternalBookmarks();
    console.log(`API route: Fetched ${bookmarks.length} bookmarks`);
    if (bookmarks.length > 0) {
      console.log('API route: First bookmark title:', bookmarks[0].title);
    }
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    const cached = ServerCacheInstance.getBookmarks();
    if (cached && Array.isArray(cached.bookmarks) && cached.bookmarks.length > 0) {
      console.log(`API route: Returning stale cached bookmarks, count: ${cached.bookmarks.length}`);
      bookmarks = cached.bookmarks;
    } else {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  }
  return NextResponse.json(bookmarks, {
    status: 200,
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=3600' }
  });
}