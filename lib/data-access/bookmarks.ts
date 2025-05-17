/**
 * Bookmarks Data Access
 *
 * Handles fetching and caching of bookmark data
 * Access pattern: In-memory Cache → S3 Storage → External API
 */

import { ServerCacheInstance } from '@/lib/server-cache';
import type { UnifiedBookmark } from '@/types';
import { refreshBookmarksData } from '@/lib/bookmarks'; // Assuming this is the correct path for the external fetch
import { readJsonS3, writeJsonS3 } from '@/lib/s3-utils';

// --- Configuration & Constants ---
export const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
export const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;

// --- Bookmarks Data Access ---

let inFlightBookmarkPromise: Promise<UnifiedBookmark[] | null> | null = null;

/**
 * Retrieves bookmarks from an external source, ensuring only one fetch occurs at a time.
 *
 * Returns a promise that resolves to an array of unified bookmark objects, or `null` if the fetch fails or no bookmarks are found.
 *
 * @remark If a fetch is already in progress, returns the existing in-flight promise instead of initiating a new request.
 */
async function fetchExternalBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (inFlightBookmarkPromise) {
    console.warn('[DataAccess/Bookmarks] Bookmark fetch already in progress, returning existing promise');
    return inFlightBookmarkPromise;
  }

  console.log('[DataAccess/Bookmarks] Initiating new external bookmarks fetch');
  inFlightBookmarkPromise = (async () => {
    try {
      const bookmarks = await refreshBookmarksData();
      if (bookmarks) {
        console.log(`[DataAccess/Bookmarks] Fetched ${bookmarks.length} bookmarks from external source`);
        return bookmarks;
      }
      return null;
    } catch (error) {
      console.error('[DataAccess/Bookmarks] Error fetching external bookmarks:', error);
      return null;
    } finally {
      inFlightBookmarkPromise = null;
      console.log('[DataAccess/Bookmarks] External bookmarks fetch completed');
    }
  })();
  return inFlightBookmarkPromise;
}

/**
 * Retrieves bookmark data using a hierarchical strategy: in-memory cache, S3 storage, and external API as fallback.
 *
 * If {@link skipExternalFetch} is true, only cache and S3 are used; otherwise, the function attempts to fetch from the external source and updates both S3 and cache on success. Returns an empty array if no bookmarks are found.
 *
 * @param skipExternalFetch - If true, bypasses the external API and relies solely on cache or S3. Defaults to false.
 * @returns A promise resolving to an array of UnifiedBookmark objects, or an empty array if none are available.
 */
export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  const cached = ServerCacheInstance.getBookmarks();
  if (cached && cached.bookmarks && cached.bookmarks.length > 0 && skipExternalFetch) {
    console.log('[DataAccess/Bookmarks] Returning bookmarks from cache (skipExternalFetch=true).');
    return cached.bookmarks;
  }

  let s3Bookmarks: UnifiedBookmark[] | null = null;
  try {
    const raw = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
    if (Array.isArray(raw)) {
      s3Bookmarks = raw;
    }
  } catch (error: unknown) {
    console.warn('[DataAccess/Bookmarks-S3] Error reading bookmarks from S3:', error instanceof Error ? error.message : String(error));
  }

  if (s3Bookmarks && s3Bookmarks.length > 0 && skipExternalFetch) {
    console.log('[DataAccess/Bookmarks-S3] Returning bookmarks from S3 (skipExternalFetch=true).');
    ServerCacheInstance.setBookmarks(s3Bookmarks);
    return s3Bookmarks;
  }

  if (!skipExternalFetch) {
    console.log('[DataAccess/Bookmarks] Attempting to fetch bookmarks externally...');
    const externalBookmarks = await fetchExternalBookmarks();
    if (externalBookmarks && externalBookmarks.length > 0) {
      console.log(`[DataAccess/Bookmarks] Fetched ${externalBookmarks.length} bookmarks externally. Writing to S3 and caching.`);
      try {
        await writeJsonS3(BOOKMARKS_S3_KEY_FILE, externalBookmarks);
        console.log(`[DataAccess/Bookmarks-S3] Successfully wrote bookmarks to ${BOOKMARKS_S3_KEY_FILE}`);
      } catch (s3WriteError: unknown) {
        console.error(`[DataAccess/Bookmarks-S3] Failed to write bookmarks to S3:`, s3WriteError instanceof Error ? s3WriteError.message : String(s3WriteError));
      }
      ServerCacheInstance.setBookmarks(externalBookmarks);
      return externalBookmarks;
    } else if (s3Bookmarks && s3Bookmarks.length > 0) {
      console.log('[DataAccess/Bookmarks] External bookmark fetch failed, returning from S3 instead.');
      ServerCacheInstance.setBookmarks(s3Bookmarks);
      return s3Bookmarks;
    }
  } else if (s3Bookmarks && s3Bookmarks.length > 0) {
    console.log('[DataAccess/Bookmarks] Returning bookmarks from S3 (skipExternalFetch=true, after external fetch was skipped).');
    ServerCacheInstance.setBookmarks(s3Bookmarks); // Cache S3 data if external fetch is skipped but S3 data exists
    return s3Bookmarks;
  }

  console.log('[DataAccess/Bookmarks] No bookmarks found from any source.');
  return [];
}
