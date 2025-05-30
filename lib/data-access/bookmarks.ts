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
import { refreshBookmarksData } from '@/lib/bookmarks.client';
import { readJsonS3, writeJsonS3 } from '@/lib/s3-utils';
import { BookmarkRefreshQueue } from '@/lib/async-job-queue';

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

  console.log('[DataAccess/Bookmarks] Initiating new external bookmarks fetch');
  // Simplified promise handling for testing
  inFlightBookmarkPromise = refreshBookmarksData()
    .then(bookmarks => {
      console.log('[DataAccess/Bookmarks] `refreshBookmarksData` returned:', bookmarks ? `${bookmarks.length} items` : bookmarks);
      if (Array.isArray(bookmarks) && bookmarks.length > 0) {
        console.log(`[DataAccess/Bookmarks] Fetched ${bookmarks.length} bookmarks from external source. Returning them.`);
        return bookmarks;
      }
      console.warn('[DataAccess/Bookmarks] `refreshBookmarksData` returned null, undefined, or empty array. Returning null.');
      return null;
    })
    .catch(error => {
      console.error('[DataAccess/Bookmarks] Error fetching external bookmarks:', error);
      return null;
    })
    .finally(() => {
      inFlightBookmarkPromise = null;
      console.log('[DataAccess/Bookmarks] External bookmarks fetch completed (inFlightPromise set to null)');
    });
  return inFlightBookmarkPromise;
}

async function fetchExternalBookmarksWithRetry(retries = 3, delay = 1000): Promise<UnifiedBookmark[] | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await fetchExternalBookmarks();
    if (result && result.length > 0) return result;
    await new Promise(res => setTimeout(res, delay * (attempt + 1)));
  }
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
  console.log('[Bookmarks] getBookmarks skipExternalFetch:', skipExternalFetch);

  const cached = ServerCacheInstance.getBookmarks();
  if (cached && cached.bookmarks && cached.bookmarks.length > 0) {
    console.log(`[Bookmarks] returning ${cached.bookmarks.length} cached bookmarks`);
    if (!skipExternalFetch && ServerCacheInstance.shouldRefreshBookmarks()) {
      console.log('[Bookmarks] cache stale, enqueueing background refresh');
      enqueueBookmarkRefresh();
    }
    return cached.bookmarks;
  }

  let s3Bookmarks: UnifiedBookmark[] | null = null;
  try {
    const raw = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
    if (Array.isArray(raw) && raw.length > 0) {
      s3Bookmarks = raw;
      ServerCacheInstance.setBookmarks(s3Bookmarks);
      console.log(`[Bookmarks] loaded ${s3Bookmarks.length} bookmarks from S3`);
    }
  } catch (error: unknown) {
    console.warn('[Bookmarks] failed reading bookmarks from S3:', error);
  }

  if (s3Bookmarks) {
    if (!skipExternalFetch && ServerCacheInstance.shouldRefreshBookmarks()) {
      console.log('[Bookmarks] using S3 bookmarks but queueing refresh');
      enqueueBookmarkRefresh();
    }
    return s3Bookmarks;
  }

  if (skipExternalFetch) {
    console.warn('[Bookmarks] no cache or S3 data and external fetch skipped');
    return [];
  }

  const external = await fetchExternalBookmarksWithRetry();
  if (external && external.length > 0) {
    try {
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, external);
    } catch (err) {
      console.warn('[Bookmarks] failed writing bookmarks to S3:', err);
    }
    ServerCacheInstance.setBookmarks(external);
    return external;
  }

  ServerCacheInstance.setBookmarks([], true);
  return [];
}
