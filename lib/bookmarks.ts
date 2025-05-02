/**
 * Bookmarks API
 *
 * Fetches bookmarks from the external Hoarder/Karakeep API.
 *
 * @module lib/bookmarks
 */

import type { UnifiedBookmark, BookmarkTag, BookmarkContent, BookmarkAsset } from '@/types';

// Define the raw structure expected from the API based on the user's example
interface RawApiBookmarkTag {
  id: string;
  name: string;
  attachedBy: 'ai' | 'user' | string;
}

interface RawApiBookmarkContent {
  type: 'link' | string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl?: string;
  imageAssetId?: string;
  screenshotAssetId?: string;
  favicon?: string;
  htmlContent?: string;
  crawledAt?: string;
  author?: string | null;
  publisher?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
}

interface RawApiBookmark {
  id: string;
  createdAt: string;
  modifiedAt: string;
  title: string | null; // Note: API seems to have title/desc here AND in content
  archived: boolean;
  favourited: boolean;
  taggingStatus: 'success' | string;
  note: string | null;
  summary: string | null;
  tags: RawApiBookmarkTag[];
  content: RawApiBookmarkContent;
  assets: BookmarkAsset[];
}

interface ApiResponse {
  bookmarks: RawApiBookmark[];
  nextCursor: string | null;
}

import { ServerCacheInstance } from './server-cache';

/**
 * Fetches bookmarks from the server cache or external API
 *
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of unified bookmarks.
 * @throws {Error} If the API request fails and no cached data is available.
 */
export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  // Check cache first
  const cachedData = ServerCacheInstance.getBookmarks();
  
  // If we have cached data and it doesn't need refreshing, return it immediately
  if (cachedData && !ServerCacheInstance.shouldRefreshBookmarks()) {
    console.log('Using cached bookmarks data');
    return cachedData.bookmarks;
  }
  
  // Either we have no cache or it's time to refresh
  // If we have cached data, we'll still use it as a fallback
  const hasCachedFallback = !!cachedData?.bookmarks.length;
  
  // Start a background refresh if we have cached data
  if (hasCachedFallback) {
    console.log('Using cached bookmarks while refreshing in background');
    // Don't await this - run in background
    refreshBookmarksData().catch(error => {
      console.error('Background refresh of bookmarks failed:', error);
    });
    return cachedData!.bookmarks;
  }
  
  // No cached data, must fetch and wait
  try {
    return await refreshBookmarksData();
  } catch (error) {
    console.error('Failed to fetch bookmarks with no cache available:', error);
    // If we have no cached data and the fetch fails, return an empty array
    return [];
  }
}

/**
 * Refreshes bookmarks data from the external API
 * 
 * @returns {Promise<UnifiedBookmark[]>} A promise that resolves to an array of unified bookmarks.
 * @throws {Error} If the API request fails.
 */
export async function refreshBookmarksData(): Promise<UnifiedBookmark[]> {
  const apiUrl = 'https://bookmark.iocloudhost.net/api/v1/lists/xrfqu4awxsqkr1ch404qwd9i/bookmarks';
  const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('BOOKMARK_BEARER_TOKEN environment variable is not set.');
    // Mark as failure but keep any existing cache
    ServerCacheInstance.setBookmarks([], true);
    return [];
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      cache: 'no-store', // Force fresh data every time
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${await response.text()}`);
    }

    const data: ApiResponse = await response.json();

    // Normalize the raw API data to the UnifiedBookmark structure
    const normalizedBookmarks = data.bookmarks.map((raw): UnifiedBookmark => {
      // Choose the best title and description (prefer content object)
      const bestTitle = raw.content.title ?? raw.title ?? 'Untitled Bookmark';
      const bestDescription = raw.content.description ?? raw.summary ?? 'No description available.';

      // Normalize tags to BookmarkTag interface (though UnifiedBookmark allows string[] for now)
       const normalizedTags: BookmarkTag[] = raw.tags.map(tag => ({
         id: tag.id,
         name: tag.name,
         attachedBy: tag.attachedBy as 'ai' | 'user', // Cast assuming API uses these values
       }));

       // Create a non-nullable content object for UnifiedBookmark
       const unifiedContent: BookmarkContent = {
         ...raw.content,
         title: bestTitle,
         description: bestDescription,
       };

      return {
        id: raw.id,
        url: raw.content.url,
        title: bestTitle,
        description: bestDescription,
        tags: normalizedTags, // Use the normalized tags
        ogImage: raw.content.imageUrl, // Map imageUrl to ogImage
        dateBookmarked: raw.createdAt, // Map createdAt to dateBookmarked
        datePublished: raw.content.datePublished, // Map content.datePublished
        // --- Include other fields from RawApiBookmark if needed ---
        createdAt: raw.createdAt,
        modifiedAt: raw.modifiedAt,
        archived: raw.archived,
        favourited: raw.favourited,
        taggingStatus: raw.taggingStatus,
        note: raw.note,
        summary: raw.summary,
        content: unifiedContent, // Assign the corrected content object
        assets: raw.assets, // Keep the original assets array
        // telegramUsername: undefined, // Not present in API data
      };
    });
    
    // Update the cache with the new data
    ServerCacheInstance.setBookmarks(normalizedBookmarks);
    
    return normalizedBookmarks;

  } catch (error) {
    console.error('Failed to fetch external bookmarks:', error);
    // Mark as failure but keep any existing cache
    ServerCacheInstance.setBookmarks([], true);
    // Re-throw to let the caller handle it
    throw error;
  }
}