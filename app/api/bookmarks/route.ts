/**
 * Bookmarks API Endpoint
 * 
 * Provides client-side access to all bookmarks
 */

import { NextResponse } from 'next/server';
import { fetchExternalBookmarks } from '@/lib/bookmarks';

// Ensure this route is cached for better performance
export const dynamic = 'force-dynamic';

/**
 * API route for fetching all bookmarks
 */
export async function GET() {
  try {
    const bookmarks = await fetchExternalBookmarks();
    return NextResponse.json(bookmarks);
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}