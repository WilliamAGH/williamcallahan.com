/**
 * Bookmarks API
 *
 * Fetches bookmarks from the external Hoarder/Karakeep API.
 *
 * @module lib/bookmarks
 */

import request, { type Response } from 'node-fetch'; // Added type Response import
import type { UnifiedBookmark, BookmarkContent, BookmarkAsset } from '@/types';
import { writeJsonS3, readJsonS3 } from '@/lib/s3-utils';
import { BOOKMARKS_S3_KEY_FILE } from '@/lib/data-access';

// Define the raw structure expected from the API based on the user's example
interface RawApiBookmarkTag {
  id: string;
  name: string;
  attachedBy: string;
}

interface RawApiBookmarkContent {
  type: 'link' | 'image' | (string & {});
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
  taggingStatus: 'complete' | 'in-progress' | (string & {});
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
 * Utility function to remove htmlContent from a content object
 */
function omitHtmlContent<T extends RawApiBookmarkContent>(content: T) {
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  const { htmlContent: _omit, ...rest } = content;
  return rest;
}

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

// Configuration: allow overriding API base URL and list ID via environment
// const BOOKMARKS_LIST_ID = process.env.BOOKMARKS_LIST_ID ?? 'xrfqu4awxsqkr1ch404qwd9i'; // Removed
// const BOOKMARKS_API_URL = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1'; // Removed

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
    return [...cachedData.bookmarks];
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

  // Read environment variables at call time
  const bookmarksListId = process.env.BOOKMARKS_LIST_ID; // Changed let to const
  if (!bookmarksListId) {
    throw new Error('BOOKMARKS_LIST_ID environment variable must be set to your list ID');
  }
  const bookmarksApiUrl = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1';
  const apiUrl = `${bookmarksApiUrl}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;

  if (!bearerToken) {
    console.error('BOOKMARK_BEARER_TOKEN environment variable is not set.');
    return [];
  }

  // Construct headers as a plain object, like the user's working example
  const requestHeaders = {
    "Accept": "application/json",
    "Authorization": `Bearer ${bearerToken}`
  };

  try {
    // Pagination: fetch all pages using nextCursor
    const allRawBookmarks: RawApiBookmark[] = [];
    let cursor: string | null = null;

    do {
      const pageUrl = cursor
        ? `${apiUrl}?cursor=${encodeURIComponent(cursor)}`
        : apiUrl;
      console.log('refreshBookmarksData: Fetching page', pageUrl);
      const pageController = new AbortController();
      const pageTimeoutId = setTimeout(() => pageController.abort(), 10000);

      const pageResponse: Response = await request(pageUrl, { // Typed pageResponse
        method: 'GET',
        headers: requestHeaders, // Use plain object for headers
        signal: pageController.signal as any, // Added 'as any' to resolve type error
        redirect: 'follow'
      });
      clearTimeout(pageTimeoutId);

      if (!pageResponse.ok) {
        const responseText = await pageResponse.text();
        console.error(`refreshBookmarksData: API request failed with status ${pageResponse.status}:`, responseText);
        throw new Error(`API request failed with status ${pageResponse.status}: ${responseText}`);
      }

      const data: ApiResponse = await pageResponse.json() as unknown as ApiResponse; // Added 'as unknown'
      console.log(`refreshBookmarksData: Retrieved ${data.bookmarks.length} bookmarks, nextCursor=${data.nextCursor}`);
      allRawBookmarks.push(...data.bookmarks);
      cursor = data.nextCursor;
    } while (cursor);

    console.log('refreshBookmarksData: Total bookmarks fetched across pages:', allRawBookmarks.length);

    // Normalize all fetched bookmarks
    const normalizedBookmarks = allRawBookmarks.map((raw): UnifiedBookmark | null => {
      if (!raw || typeof raw !== 'object') {
        console.warn('refreshBookmarksData: Invalid bookmark data received', raw);
        return null;
      }

      try {
        // Choose the best title and description (prefer user-edited title)
        const bestTitle = raw.title || raw.content?.title || 'Untitled Bookmark';
        const bestDescription = raw.summary || raw.content?.description || 'No description available.';

        // Normalize tags
        const normalizedTags = Array.isArray(raw.tags)
          ? raw.tags.map(tag => ({
              id: tag.id,
              name: tag.name,
              attachedBy: ((value): 'user' | 'ai' | undefined => {
                return value === 'user' ? 'user' : value === 'ai' ? 'ai' : undefined;
              })(tag.attachedBy)
            }))
          : [];

        // Build content object
        const unifiedContent: BookmarkContent = {
          ...(raw.content ? omitHtmlContent(raw.content) : {}),
          type: 'link',
          url: raw.content?.url || '',
          title: bestTitle,
          description: bestDescription
        };

        return {
          id: raw.id,
          url: raw.content?.url || '',
          title: bestTitle,
          description: bestDescription,
          tags: normalizedTags,
          ogImage: raw.content?.imageUrl,
          dateBookmarked: raw.createdAt,
          datePublished: raw.content?.datePublished,
          createdAt: raw.createdAt,
          modifiedAt: raw.modifiedAt,
          archived: raw.archived,
          favourited: raw.favourited,
          taggingStatus: raw.taggingStatus,
          note: raw.note,
          summary: raw.summary,
          content: unifiedContent,
          assets: Array.isArray(raw.assets) ? raw.assets : []
        };
      } catch (error) {
        console.error('refreshBookmarksData: Error normalizing bookmark', error, raw);
        return null;
      }
    }).filter((bookmark): bookmark is UnifiedBookmark => bookmark !== null);

    console.log('refreshBookmarksData: Successfully normalized', normalizedBookmarks.length, 'bookmarks');
    // Persist updated bookmarks list back to S3 to keep it in sync
    writeJsonS3(BOOKMARKS_S3_KEY_FILE, normalizedBookmarks).catch(error => {
      console.error('refreshBookmarksData: Failed to write updated bookmarks to S3:', error);
    });
    return normalizedBookmarks;
  } catch (error) {
    console.error('refreshBookmarksData: Failed to fetch external bookmarks:', error);
    // Fallback: attempt to return existing S3 data if available
    try {
      const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
      if (Array.isArray(s3Backup)) {
        console.log(`refreshBookmarksData: Falling back to S3 data, count: ${s3Backup.length}`);
        return s3Backup;
      }
    } catch (s3Error) {
      console.error('refreshBookmarksData: Error reading fallback S3 data:', s3Error);
    }
    // Return empty array if fallback unavailable
    return [];
  }
}
