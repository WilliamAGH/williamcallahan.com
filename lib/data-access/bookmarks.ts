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
import { AppError } from '@/lib/errors';

// --- Configuration & Constants ---
export const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
export const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;

// --- Bookmarks Data Access ---

let inFlightBookmarkPromise: Promise<UnifiedBookmark[] | null> | null = null;
let isRefreshLocked = false;

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
    const backoffMs = Math.min(delay * 2 ** attempt, 30_000); // cap at 30 s
    await new Promise(res => setTimeout(res, backoffMs));
  }
  console.warn('[DataAccess/Bookmarks] All retry attempts exhausted for fetching bookmarks');
  return null;
}

async function refreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (isRefreshLocked) {
    console.log('[Bookmarks] Refresh is already locked. Aborting new refresh call.');
    return null;
  }
  isRefreshLocked = true;
  console.log('[Bookmarks] Acquiring refresh lock.');

  try {
    const bookmarks = await fetchExternalBookmarksWithRetry();
    if (bookmarks && bookmarks.length > 0) {
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, bookmarks);
      ServerCacheInstance.setBookmarks(bookmarks);
      console.log(`[Bookmarks] Successfully refreshed and persisted ${bookmarks.length} bookmarks.`);
      return bookmarks;
    }
    console.warn('[Bookmarks] External fetch returned no bookmarks. Cache and S3 not updated.');
    ServerCacheInstance.setBookmarks([], true);
    return [];
  } catch (error) {
    console.error('[Bookmarks] CRITICAL: Failed to refresh and persist bookmarks.', error);
    return null;
  } finally {
    isRefreshLocked = false;
    console.log('[Bookmarks] Releasing refresh lock.');
  }
}

/**
 * Retrieves bookmark data using a hierarchical strategy: in-memory cache, S3 storage, and external API as fallback
 *
 * @param skipExternalFetch - If true, bypasses the external API and relies solely on cache or S3. Defaults to false
 * @returns Promise resolving to an array of UnifiedBookmark objects, or an empty array if none are available
 */
export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  const cached = ServerCacheInstance.getBookmarks();
  const shouldRefresh = ServerCacheInstance.shouldRefreshBookmarks();

  // ALWAYS return cached data first if available (even if stale)
  if (cached?.bookmarks?.length) {
    console.log(`[Bookmarks] Returning ${cached.bookmarks.length} bookmarks from in-memory cache.`);
    
    // Trigger background refresh if needed (NON-BLOCKING)
    if (!skipExternalFetch && shouldRefresh && !isRefreshLocked) {
      console.log('[Bookmarks] Triggering background refresh (non-blocking).');
      // Start background refresh without awaiting
      void refreshInBackground();
    }
    
    return cached.bookmarks;
  }

  // No cached data - try S3 first
  try {
    const s3Bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
    if (Array.isArray(s3Bookmarks) && s3Bookmarks.length > 0) {
      console.log(`[Bookmarks] Loaded ${s3Bookmarks.length} bookmarks from S3.`);
      ServerCacheInstance.setBookmarks(s3Bookmarks);
      
      // Trigger background refresh if needed (NON-BLOCKING)
      if (!skipExternalFetch && shouldRefresh && !isRefreshLocked) {
        console.log('[Bookmarks] Triggering background refresh after S3 load (non-blocking).');
        void refreshInBackground();
      }
      
      return s3Bookmarks;
    }
  } catch (error) {
    console.warn('[Bookmarks] Failed to read from S3:', error);
  }

  // No cached data and no S3 data - do synchronous refresh as last resort
  if (!skipExternalFetch) {
    console.log('[Bookmarks] No cached or S3 data available. Performing synchronous refresh as last resort.');
    const freshBookmarks = await refreshAndPersistBookmarks();
    if (freshBookmarks) {
      return freshBookmarks;
    }
  }

  console.warn('[Bookmarks] No bookmarks available from any source.');
  return [];
}

/**
 * Performs background refresh without blocking the current request
 */
async function refreshInBackground(): Promise<void> {
  if (isRefreshLocked) {
    console.log('[Bookmarks] Background refresh skipped - already in progress.');
    return;
  }

  console.log('[Bookmarks] Starting background refresh.');
  isRefreshLocked = true;

  try {
    const freshBookmarks = await fetchExternalBookmarksWithRetry();
    
    if (freshBookmarks && freshBookmarks.length > 0) {
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, freshBookmarks);
      ServerCacheInstance.setBookmarks(freshBookmarks);
      console.log(`[Bookmarks] Background refresh completed - updated cache with ${freshBookmarks.length} bookmarks.`);
    } else {
      console.warn('[Bookmarks] Background refresh failed - keeping existing cache.');
      // Mark as failed attempt but don't update the bookmarks
      const existing = ServerCacheInstance.getBookmarks();
      if (existing?.bookmarks) {
        ServerCacheInstance.setBookmarks(existing.bookmarks, true);
      }
    }
  } catch (error) {
    console.error('[Bookmarks] Background refresh error:', error);
    // Mark as failed attempt but don't update the bookmarks
    const existing = ServerCacheInstance.getBookmarks();
    if (existing?.bookmarks) {
      ServerCacheInstance.setBookmarks(existing.bookmarks, true);
    }
  } finally {
    isRefreshLocked = false;
    console.log('[Bookmarks] Background refresh completed.');
  }
}
