/**
 * Bookmarks Client API
 *
 * Client-side API wrapper for fetching bookmarks.
 *
 * @module lib/bookmarks.client
 */

import type { UnifiedBookmark } from '@/types';
import { ServerCacheInstance } from './server-cache';
import { getBaseUrl } from './getBaseUrl';
import fs from 'fs';
import path from 'path';

// For build-time static generation
const isServer = typeof window === 'undefined';
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

/**
 * Read bookmarks directly from the file system during build time
 * This is used for static site generation and avoids API calls during build
 */
export async function getBookmarksForStaticBuild(): Promise<UnifiedBookmark[]> {
  if (isServer && isBuildPhase) {
    try {
      const bookmarksPath = path.join(process.cwd(), 'data', 'bookmarks', 'bookmarks.json');
      const fileContents = fs.readFileSync(bookmarksPath, 'utf-8');
      const bookmarks = JSON.parse(fileContents) as UnifiedBookmark[];
      console.log(`[Static Build] Read ${bookmarks.length} bookmarks from file system`);
      return bookmarks;
    } catch (error) {
      console.error('[Static Build] Error reading bookmarks from file system:', error);
      return [];
    }
  }

  // Fall back to API for non-build environments
  return fetchExternalBookmarksCached();
}

/**
 * Fetches all bookmarks from our backend API endpoint.
 * The API endpoint handles differential updates and local persistence.
 * For client-side use.
 */
export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  try {
    // Always use API endpoint
    console.log('Client library: Fetching bookmarks from API endpoint (/api/bookmarks)');
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/bookmarks`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store', // Ensure we get the latest from our API, which handles its own caching/persistence
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request to /api/bookmarks failed with status ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log('Client library: Received response from /api/bookmarks with', Array.isArray(data) ? `${data.length} bookmarks` : 'non-array data');
    return data;
  } catch (error) {
    console.error('Client library: Failed to fetch bookmarks from /api/bookmarks:', error);
    return [];
  }
}

/**
 * Fetches bookmarks, utilizing in-memory cache first.
 * If not in memory cache, fetches from the backend API.
 */
export async function fetchExternalBookmarksCached(): Promise<UnifiedBookmark[]> {
  try {
    console.log('Client library: Attempting to fetch cached bookmarks (memory first)');

    const cached = ServerCacheInstance.getBookmarks();
    if (cached && Array.isArray(cached.bookmarks) && cached.bookmarks.length > 0) {
      // Optional: Add a timestamp to the cache and check for staleness if needed
      // For now, if it's in memory, use it.
      console.log(`Client library: Using memory-cached bookmarks (${cached.bookmarks.length})`);
      return cached.bookmarks;
    }

    console.log('Client library: No suitable memory cache, fetching fresh data via fetchExternalBookmarks()');
    const bookmarks = await fetchExternalBookmarks();
    // Update memory cache with freshly fetched data
    if (bookmarks.length > 0) {
      ServerCacheInstance.setBookmarks(bookmarks);
      console.log(`Client library: Updated memory cache with ${bookmarks.length} bookmarks after fetch.`);
    }
    return bookmarks;
  } catch (error) {
    console.error('Client library: Failed to fetch cached bookmarks:', error);
    return [];
  }
}

/**
 * Triggers a refresh of bookmarks data by calling the API endpoint
 * (which handles the actual refresh from the true external source and updates its persistent store).
 * Updates the client-side in-memory cache with the refreshed data.
 */
export async function refreshBookmarksData(): Promise<UnifiedBookmark[]> {
  try {
    // Always use API endpoint
    console.log('Client library: Triggering refresh of bookmarks data via /api/bookmarks');
    const baseUrl = getBaseUrl();
    const response = await fetch(`${baseUrl}/api/bookmarks?refresh=true`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request to /api/bookmarks?refresh=true failed with status ${response.status}: ${errorText}`);
    }

    const bookmarks = await response.json();

    if (Array.isArray(bookmarks)) {
      console.log(`Client library: Refreshed ${bookmarks.length} bookmarks successfully from API.`);
      ServerCacheInstance.setBookmarks(bookmarks); // Update memory cache
      console.log(`Client library: Updated memory cache with ${bookmarks.length} refreshed bookmarks.`);
      return bookmarks;
    } else {
      throw new Error('No valid bookmarks array received from refresh operation via API');
    }
  } catch (error) {
    console.error('Client library: Failed to refresh bookmarks data:', error);
    throw error; // Re-throw to let the caller handle it
  }
}