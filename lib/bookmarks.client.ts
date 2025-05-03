/**
 * Bookmarks Client API
 * 
 * Client-side API wrapper for fetching bookmarks.
 * 
 * @module lib/bookmarks.client
 */

import type { UnifiedBookmark } from '@/types';

/**
 * Fetches all bookmarks via API endpoint
 * For client-side use
 */
export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  try {
    console.log('Client library: Fetching bookmarks from API endpoint');
    const response = await fetch('/api/bookmarks', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      // Force fresh data - don't use cache
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Client library: Received response with', Array.isArray(data) ? `${data.length} bookmarks` : 'non-array data');
    return data;
  } catch (error) {
    console.error('Client library: Failed to fetch bookmarks:', error);
    return [];
  }
}