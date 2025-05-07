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
// Module-level cache to avoid multiple API calls during build
let cachedBookmarksPromise: Promise<UnifiedBookmark[]> | null = null;

/**
 * Cached version of fetchExternalBookmarks that reuses the same promise
 * for multiple calls during build time
 */
export function fetchExternalBookmarksCached(): Promise<UnifiedBookmark[]> {
  return cachedBookmarksPromise ??= fetchExternalBookmarks();
}

export async function fetchExternalBookmarks(): Promise<UnifiedBookmark[]> {
  // Check cache first
  const cachedData = ServerCacheInstance.getBookmarks();

  // If we have cached data and it doesn't need refreshing, return it immediately
  if (cachedData && !ServerCacheInstance.shouldRefreshBookmarks()) {
    console.log('Using cached bookmarks data');

    // Double-check the cached data is valid
    if (Array.isArray(cachedData.bookmarks) && cachedData.bookmarks.length > 0) {
      // Return a copy to avoid mutation by background refresh
      return [...cachedData.bookmarks];
    }
  }

  // Check for cached fallback
  const hasCachedFallback = !!cachedData?.bookmarks?.length;

  // Start a background refresh if we have cached data
  if (hasCachedFallback) {
    console.log('Using cached bookmarks while refreshing in background');
    // Don't await this - run in background
    refreshBookmarksData().catch(error => {
      console.error('Background refresh of bookmarks failed:', error);
    });
    // Return a copy to avoid subsequent mutations
    return [...cachedData!.bookmarks];
  }

  // No cached data, must fetch and wait
  try {
    console.log('fetchExternalBookmarks: No cache available, fetching fresh data');
    const freshBookmarks = await refreshBookmarksData();
    console.log('fetchExternalBookmarks: Successfully fetched fresh bookmarks, count:', freshBookmarks.length);
    return freshBookmarks;
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
  console.log('refreshBookmarksData: Starting fresh fetch from API');

  const apiUrl = 'https://bookmark.iocloudhost.net/api/v1/lists/xrfqu4awxsqkr1ch404qwd9i/bookmarks';
  const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('BOOKMARK_BEARER_TOKEN environment variable is not set.');
    return [];
  }

  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

  try {
    console.log('refreshBookmarksData: Fetching from API with authorization');
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
      },
      signal: controller.signal,
      // Use longer cache time to enable static generation
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    clearTimeout(timeoutId); // Clear the timeout

    if (!response.ok) {
      const responseText = await response.text();
      console.error(`refreshBookmarksData: API request failed with status ${response.status}:`, responseText);
      throw new Error(`API request failed with status ${response.status}: ${responseText}`);
    }

    console.log('refreshBookmarksData: API response received, parsing JSON');
    const data: ApiResponse = await response.json();

    // Normalize the raw API data to the UnifiedBookmark structure
    console.log('refreshBookmarksData: Normalizing', data.bookmarks.length, 'bookmarks from API');

    const normalizedBookmarks = data.bookmarks.map((raw): UnifiedBookmark | null => {
      if (!raw || typeof raw !== 'object') {
        console.warn('refreshBookmarksData: Invalid bookmark data received', raw);
        return null;
      }

      try {
        // Choose the best title and description (prefer title field that user edits)
        // First check if either field exists, otherwise use fallbacks
        const bestTitle = raw.title || raw.content?.title || 'Untitled Bookmark';
        const bestDescription = raw.summary || raw.content?.description || 'No description available.';

        // Normalize tags to BookmarkTag interface (though UnifiedBookmark allows string[] for now)
        const normalizedTags: BookmarkTag[] = Array.isArray(raw.tags)
          ? raw.tags.map(tag => ({
              id: tag.id,
              name: tag.name,
              attachedBy: tag.attachedBy as 'ai' | 'user', // Cast assuming API uses these values
            }))
          : [];

        // Create a non-nullable content object for UnifiedBookmark
        // Ensure content exists, even if raw.content is missing
        const unifiedContent: BookmarkContent = {
          // Spread existing content properties first, omitting htmlContent which can be very large
          ...(raw.content ? {
            // exclude htmlContent to shrink payload
            ...((({ htmlContent, ...rest }) => rest)(raw.content))
          } : {}),
          // Then override with our preferred values
          type: 'link',
          url: raw.content?.url || '',
          title: bestTitle || 'Untitled Bookmark',
          description: bestDescription || 'No description available.'
        };

        return {
          id: raw.id,
          url: raw.content?.url || '',
          title: bestTitle,
          description: bestDescription,
          tags: normalizedTags, // Use the normalized tags
          ogImage: raw.content?.imageUrl, // Map imageUrl to ogImage
          dateBookmarked: raw.createdAt, // Map createdAt to dateBookmarked
          datePublished: raw.content?.datePublished, // Map content.datePublished
          // --- Include other fields from RawApiBookmark if needed ---
          createdAt: raw.createdAt,
          modifiedAt: raw.modifiedAt,
          archived: raw.archived,
          favourited: raw.favourited,
          taggingStatus: raw.taggingStatus,
          note: raw.note,
          summary: raw.summary,
          content: unifiedContent, // Assign the corrected content object
          assets: Array.isArray(raw.assets) ? raw.assets : [], // Make sure assets is an array
          // telegramUsername: undefined, // Not present in API data
        };
      } catch (error) {
        console.error('refreshBookmarksData: Error normalizing bookmark', error, raw);
        return null;
      }
    }).filter((bookmark): bookmark is UnifiedBookmark => bookmark !== null); // Remove any null items

    console.log('refreshBookmarksData: Successfully normalized', normalizedBookmarks.length, 'bookmarks');

    return normalizedBookmarks;

  } catch (error) {
    console.error('refreshBookmarksData: Failed to fetch external bookmarks:', error);
    clearTimeout(timeoutId);
    // Re-throw to let the caller handle it
    throw error;
  } finally {
    clearTimeout(timeoutId); // Ensure timeout is cleared in all cases
  }
}