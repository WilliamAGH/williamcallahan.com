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
    const response = await fetch('/api/bookmarks', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch bookmarks:', error);
    return [];
  }
}