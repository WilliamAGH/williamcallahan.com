/**
 * Bookmarks API
 *
 * Fetches bookmarks from the external Hoarder/Karakeep API
 *
 * @module lib/bookmarks
 */

import request, { type Response } from 'node-fetch';
import type { AbortSignal as NodeFetchAbortSignal } from 'node-fetch/externals';
import type { UnifiedBookmark, BookmarkContent, BookmarkAsset } from '@/types';
import { writeJsonS3, readJsonS3 } from '@/lib/s3-utils';
import { BOOKMARKS_S3_KEY_FILE } from '@/lib/data-access/bookmarks';

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
  console.log('[refreshBookmarksData] Starting refresh cycle from external API...');

  // Read environment variables at call time
  const bookmarksListId = process.env.BOOKMARKS_LIST_ID;
  if (!bookmarksListId) {
    console.error('[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARKS_LIST_ID environment variable is not set.');
    throw new Error('BOOKMARKS_LIST_ID environment variable must be set to your list ID');
  }
  const bookmarksApiUrl = process.env.BOOKMARKS_API_URL ?? 'https://bookmark.iocloudhost.net/api/v1';
  const apiUrl = `${bookmarksApiUrl}/lists/${bookmarksListId}/bookmarks`;

  const bearerToken = process.env.BOOKMARK_BEARER_TOKEN;
  if (!bearerToken) {
    console.error('[refreshBookmarksData] CRITICAL_CONFIG: BOOKMARK_BEARER_TOKEN environment variable is not set.');
    throw new Error('BOOKMARK_BEARER_TOKEN environment variable is not set. Cannot fetch bookmarks.');
  }

  const requestHeaders = {
    "Accept": "application/json",
    "Authorization": `Bearer ${bearerToken}`
  };

  let primaryFetchError: Error | null = null;

  try {
    console.log(`[refreshBookmarksData] Fetching all bookmarks from API: ${apiUrl}`);
    const allRawBookmarks: RawApiBookmark[] = [];
    let cursor: string | null = null;
    let pageCount = 0;

    do {
      pageCount++;
      const pageUrl = cursor
        ? `${apiUrl}?cursor=${encodeURIComponent(cursor)}`
        : apiUrl;
      console.log(`[refreshBookmarksData] Fetching page ${pageCount}: ${pageUrl}`);
      const pageController = new AbortController();
      const pageTimeoutId = setTimeout(() => {
        console.warn(`[refreshBookmarksData] Aborting fetch for page ${pageUrl} due to 10s timeout.`);
        pageController.abort();
      }, 10000); // 10 second timeout per page

      let pageResponse: Response;
      try {
        pageResponse = await request(pageUrl, {
          method: 'GET',
          headers: requestHeaders,
          signal: pageController.signal as NodeFetchAbortSignal,
          redirect: 'follow'
        });
      } finally {
        clearTimeout(pageTimeoutId);
      }

      if (!pageResponse.ok) {
        const responseText = await pageResponse.text();
        const apiError = new Error(`API request to ${pageUrl} failed with status ${pageResponse.status}: ${responseText}`);
        console.error('[refreshBookmarksData] External API request error:', apiError.message);
        throw apiError;
      }

      const data: ApiResponse = await pageResponse.json() as unknown as ApiResponse;
      console.log(`[refreshBookmarksData] Retrieved ${data.bookmarks.length} bookmarks from page ${pageCount}. Next cursor: '${data.nextCursor}'`);
      allRawBookmarks.push(...data.bookmarks);
      cursor = data.nextCursor;
    } while (cursor);

    console.log(`[refreshBookmarksData] Total raw bookmarks fetched across ${pageCount} pages: ${allRawBookmarks.length}`);

    const normalizedBookmarks = allRawBookmarks.map((raw, index): UnifiedBookmark | null => {
      if (!raw || typeof raw !== 'object') {
        console.warn(`[refreshBookmarksData] Invalid raw bookmark data at index ${index}:`, raw);
        return null;
      }
      try {
        const bestTitle = raw.title || raw.content?.title || 'Untitled Bookmark';
        const bestDescription = raw.summary || raw.content?.description || 'No description available.';
        const normalizedTags = Array.isArray(raw.tags)
          ? raw.tags.map(tag => ({
              id: tag.id,
              name: tag.name,
              attachedBy: ((value): 'user' | 'ai' | undefined => {
                return value === 'user' ? 'user' : value === 'ai' ? 'ai' : undefined;
              })(tag.attachedBy)
            }))
          : [];
        const unifiedContent: BookmarkContent = {
          ...(raw.content ? omitHtmlContent(raw.content) : {}),
          type: raw.content?.type ?? 'link',
          url: raw.content?.url || '',
          title: bestTitle || 'Untitled Bookmark',
          description: bestDescription || 'No description available.'
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
      } catch (normError) {
        console.error(`[refreshBookmarksData] Error normalizing bookmark at index ${index} (ID: ${raw.id || 'N/A'}):`, normError, raw);
        return null;
      }
    }).filter((bookmark): bookmark is UnifiedBookmark => bookmark !== null);

    console.log(`[refreshBookmarksData] Successfully normalized ${normalizedBookmarks.length} bookmarks.`);

    try {
      console.log(`[refreshBookmarksData] Writing ${normalizedBookmarks.length} bookmarks to S3 key: ${BOOKMARKS_S3_KEY_FILE}`);
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, normalizedBookmarks);
      console.log('[refreshBookmarksData] Successfully wrote updated bookmarks to S3.');

      ServerCacheInstance.setBookmarks(normalizedBookmarks, false);
      console.log('[refreshBookmarksData] Successfully updated ServerCacheInstance with new bookmarks.');
    } catch (s3OrCacheError) {
      console.error('[refreshBookmarksData] CRITICAL_PERSISTENCE_FAILURE: Failed to write to S3 or update cache after successful API fetch:', s3OrCacheError);
      throw s3OrCacheError; // Re-throw to ensure cron job recognizes the failure.
    }
    console.log('[refreshBookmarksData] Refresh cycle completed successfully.');
    return normalizedBookmarks;

  } catch (error) {
    primaryFetchError = error instanceof Error ? error : new Error(String(error));
    console.error(`[refreshBookmarksData] PRIMARY_FETCH_FAILURE: Error during external API fetch or processing: ${primaryFetchError.message}`, primaryFetchError);

    // Fallback: attempt to return existing S3 data for resilience, but primary mission failed.
    try {
      console.log('[refreshBookmarksData] Attempting to load fallback data from S3 due to primary fetch failure.');
      const s3Backup = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
      if (Array.isArray(s3Backup) && s3Backup.length > 0) {
        console.log(`[refreshBookmarksData] S3_FALLBACK_SUCCESS: Successfully loaded ${s3Backup.length} bookmarks from S3 as fallback.`);
        // Even if S3 fallback works, the cron job's primary task (fresh refresh) failed.
        // So, we re-throw the original primaryFetchError to signal this to the cron runner.
        // Other direct callers of this function might handle the returned s3Backup differently if no error is thrown.
        // For the cron path, failure means failure.
      } else {
        console.warn('[refreshBookmarksData] S3_FALLBACK_NODATA: S3 fallback attempted but no data was found or data was empty.');
      }
    } catch (s3ReadError) {
      console.error('[refreshBookmarksData] S3_FALLBACK_FAILURE: Error reading fallback S3 data:', s3ReadError);
    }

    // Always re-throw the primary fetch error so the cron job knows the refresh didn't complete as intended.
    throw primaryFetchError;
  }
}
