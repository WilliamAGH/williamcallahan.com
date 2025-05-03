/**
 * Bookmarks API Endpoint
 * 
 * Provides client-side access to all bookmarks
 */

import { NextResponse } from 'next/server';
import { fetchExternalBookmarks } from '@/lib/bookmarks';

// This route always bypasses the cache for up-to-date bookmark data
export const dynamic = 'force-dynamic';

/**
 * API route for fetching all bookmarks
 */
export async function GET() {
  try {
    console.log('API route: Starting to fetch bookmarks');
    const bookmarks = await fetchExternalBookmarks();
    console.log(`API route: Fetched ${bookmarks.length} bookmarks`);
    
    // Log the first bookmark to verify data structure
    if (bookmarks.length > 0) {
      console.log('API route: First bookmark title:', bookmarks[0].title);
    }
    
    return NextResponse.json(bookmarks);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}