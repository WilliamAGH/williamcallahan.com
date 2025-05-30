/**
 * Bookmarks Data Access Module
 *
 * Handles fetching and caching of bookmark data across storage layers
 * Access pattern: In-memory Cache → S3 Storage → External API
 *
 * @module data-access/bookmarks
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { UnifiedBookmark } from '@/types';
import { refreshBookmarksData as directRefreshBookmarksData } from '@/lib/bookmarks';
import { readJsonS3, writeJsonS3 } from '@/lib/s3-utils';
import { BookmarkRefreshQueue } from '@/lib/async-job-queue';
import { AppError } from '@/lib/errors';

// --- Configuration & Constants ---
export const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
export const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;

// --- Bookmarks Data Access ---

let inFlightBookmarkPromise: Promise<UnifiedBookmark[] | null> | null = null;

/**
 * Retrieves bookmarks from an external source, ensuring only one fetch occurs at a time
 *
 * @returns Promise that resolves to an array of unified bookmark objects, or null if the fetch fails
 * @remark If a fetch is already in progress, returns the existing in-flight promise
 */
async function fetchExternalBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (inFlightBookmarkPromise) {
    console.warn('[DataAccess/Bookmarks] Bookmark fetch already in progress, returning existing promise');
    return inFlightBookmarkPromise;
  }

  console.log('[DataAccess/Bookmarks] Initiating new direct external bookmarks fetch using directRefreshBookmarksData');
  inFlightBookmarkPromise = directRefreshBookmarksData()
    .then(bookmarks => {
      console.log('[DataAccess/Bookmarks] `directRefreshBookmarksData` completed. Bookmarks count:', bookmarks ? bookmarks.length : 0);
      if (Array.isArray(bookmarks) && bookmarks.length > 0) {
        return bookmarks;
      }
      console.warn('[DataAccess/Bookmarks] `directRefreshBookmarksData` returned null, undefined, or empty array. This will be treated as a recoverable state returning no bookmarks.');
      return null;
    })
    .catch(error => {
      console.error('[DataAccess/Bookmarks] Error during `directRefreshBookmarksData` execution (re-throwing as AppError):', error);
      if (error instanceof AppError) {
        throw error;
      }
      if (error instanceof Error) {
        throw new AppError(`Failed to fetch external bookmarks: ${error.message}`, 'BOOKMARK_API_FETCH_FAILED', error);
      }
      throw new AppError('Failed to fetch external bookmarks due to an unknown error.', 'BOOKMARK_API_FETCH_FAILED_UNKNOWN');
    })
    .finally(() => {
      inFlightBookmarkPromise = null;
      console.log('[DataAccess/Bookmarks] External bookmarks fetch completed (inFlightPromise set to null)');
    });
  return inFlightBookmarkPromise;
}

async function fetchExternalBookmarksWithRetry(retries = 3, delay = 1000): Promise<UnifiedBookmark[] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      console.log(`[DataAccess/Bookmarks] Retry attempt ${attempt}/${retries - 1} for fetching bookmarks`);
    }
    const result = await fetchExternalBookmarks();
    if (result && result.length > 0) return result;
    await new Promise(res => setTimeout(res, delay * (attempt + 1)));
  }
  console.warn('[DataAccess/Bookmarks] All retry attempts exhausted for fetching bookmarks');
  return null;
}

function enqueueBookmarkRefresh() {
  BookmarkRefreshQueue.add(async () => {
    const bookmarks = await fetchExternalBookmarksWithRetry();
    if (bookmarks && bookmarks.length > 0) {
      try {
        await writeJsonS3(BOOKMARKS_S3_KEY_FILE, bookmarks);
      } catch (err) {
        console.warn('[Bookmarks] background write to S3 failed:', err);
      }
      ServerCacheInstance.setBookmarks(bookmarks);
    } else {
      ServerCacheInstance.setBookmarks([], true);
    }
  });
}

/**
 * Retrieves bookmark data using a hierarchical strategy: in-memory cache, S3 storage, and external API as fallback
 *
 * @param skipExternalFetch - If true, bypasses the external API and relies solely on cache or S3. Defaults to false
 * @returns Promise resolving to an array of UnifiedBookmark objects, or an empty array if none are available
 */
export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  // console.log('[getBookmarks] Starting with skipExternalFetch:', skipExternalFetch);
  const cached = ServerCacheInstance.getBookmarks();
  // console.log('[getBookmarks] Cache state:', cached ? `has ${cached.bookmarks?.length || 0} bookmarks` : 'no cache');

  const bookmarksLength = cached?.bookmarks?.length;
  if (typeof bookmarksLength === 'number' && bookmarksLength > 0) {
    // console.log('[Bookmarks] returning ${cached.bookmarks.length} cached bookmarks');
    if (!skipExternalFetch && ServerCacheInstance.shouldRefreshBookmarks()) {
      // console.log('[Bookmarks] cache stale, enqueueing background refresh');
      enqueueBookmarkRefresh();
    } else if (ServerCacheInstance.shouldRefreshBookmarks()) {
      // console.log('[Bookmarks] cache stale but external fetch skipped, not enqueueing refresh');
    }
    return cached!.bookmarks;
  }

  let s3Bookmarks: UnifiedBookmark[] | null = null;
  try {
    const raw = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
    if (Array.isArray(raw) && raw.length > 0) {
      s3Bookmarks = raw;
      ServerCacheInstance.setBookmarks(s3Bookmarks);
      // console.log(`[Bookmarks] loaded ${s3Bookmarks.length} bookmarks from S3`);
    }
  } catch (error: unknown) {
    console.warn('[Bookmarks] failed reading bookmarks from S3:', error);
  }

  if (s3Bookmarks) {
    if (!skipExternalFetch) {
      // console.log('[Bookmarks] S3 data loaded, enqueueing background refresh to ensure freshness.');
      enqueueBookmarkRefresh();
    }
    return s3Bookmarks;
  }

  if (skipExternalFetch) {
    // console.warn('[Bookmarks] no cache or S3 data and external fetch skipped');
    return [];
  }

  const external = await fetchExternalBookmarksWithRetry();
  if (external && external.length > 0) {
    try {
      // S3 write is now handled within directRefreshBookmarksData,
      // so this explicit writeJsonS3 call is no longer needed here if 'external' comes from directRefreshBookmarksData.
      // However, getBookmarks can also be called by other parts of the app,
      // so we need to be careful.
      // For now, let's assume directRefreshBookmarksData ALREADY wrote to S3 and updated cache.
      // The main call path for this specific S3 write is if 'external' came from a different source
      // than the new direct path. But `external` *does* come from `fetchExternalBookmarksWithRetry` which calls `fetchExternalBookmarks`
      // which now uses `directRefreshBookmarksData`.
      // So, the writeJsonS3 and setBookmarks below in getBookmarks are now redundant if the direct path was taken.
      // We can remove them if `external` is guaranteed to be populated by the new direct path.

      // await writeJsonS3(BOOKMARKS_S3_KEY_FILE, external); // Potentially redundant
      // ServerCacheInstance.setBookmarks(external); // Potentially redundant
      // console.log('[Bookmarks] Data should have been set to S3 and cache by directRefreshBookmarksData if external fetch occurred.');
    } catch (err) {
      console.warn('[Bookmarks] failed writing bookmarks to S3 (this path should ideally not be hit if direct refresh worked):', err);
    }
    // ServerCacheInstance.setBookmarks(external); // This is definitely done by directRefreshBookmarksData
    return external;
  }

  ServerCacheInstance.setBookmarks([], true); // This is for cases where external fetch failed to return data.
  return [];
}

async function fetchAndCacheBookmarks(): Promise<UnifiedBookmark[]> {
  // console.log('[fetchAndCacheBookmarks] Attempting to fetch bookmarks from API.');
  try {
    const response = await fetch('/api/bookmarks');
    const data: UnifiedBookmark[] = await response.json();
    // console.log(`[fetchAndCacheBookmarks] Fetched ${data.length} bookmarks. Caching now.`);
    ServerCacheInstance.setBookmarks(data);
    return data;
  } catch (error) {
    // console.error('[fetchAndCacheBookmarks] Error fetching bookmarks:', error);
    // In case of error, return empty array or handle as per application's error policy
    return [];
  }
}
