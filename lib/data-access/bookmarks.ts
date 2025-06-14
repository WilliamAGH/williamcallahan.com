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
import { randomInt } from 'node:crypto';

// --- Configuration & Constants ---
export const BOOKMARKS_S3_KEY_DIR = 'bookmarks';
export const BOOKMARKS_S3_KEY_FILE = `${BOOKMARKS_S3_KEY_DIR}/bookmarks.json`;
const DISTRIBUTED_LOCK_S3_KEY = `${BOOKMARKS_S3_KEY_DIR}/refresh-lock.json`;
const LOCK_TTL_MS = 10 * 60 * 1000; // 10 minutes lock TTL
const INSTANCE_ID = `instance-${randomInt(1000000, 9999999)}-${Date.now()}`;

// --- Bookmarks Data Access ---

let inFlightBookmarkPromise: Promise<UnifiedBookmark[] | null> | null = null;

/**
 * S3-based distributed lock for coordinating bookmark refreshes across multiple instances
 */
interface DistributedLockEntry {
  instanceId: string;
  acquiredAt: number;
  ttlMs: number;
}

/**
 * Attempts to acquire a distributed lock using S3
 * @param lockKey - S3 key for the lock file
 * @param ttlMs - Time-to-live for the lock in milliseconds
 * @returns Promise resolving to true if lock acquired, false otherwise
 */
async function acquireDistributedLock(lockKey: string, ttlMs: number): Promise<boolean> {
  try {
    // Check if lock file exists and if it's still valid
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
    
    if (existingLock && typeof existingLock === 'object') {
      const now = Date.now();
      const lockAge = now - existingLock.acquiredAt;
      
      // If lock is still valid (not expired), acquisition fails
      if (lockAge < existingLock.ttlMs) {
        const remainingMs = existingLock.ttlMs - lockAge;
                 console.log(`[Bookmarks] Distributed lock held by ${existingLock.instanceId}, ${Math.round(remainingMs / 1000)}s remaining`);
         return false;
       }
       
       console.log(`[Bookmarks] Found expired lock from ${existingLock.instanceId}, attempting to acquire`);
    }
    
    // Attempt to acquire lock by writing our instance data
    const lockEntry: DistributedLockEntry = {
      instanceId: INSTANCE_ID,
      acquiredAt: Date.now(),
      ttlMs
    };
    
    await writeJsonS3(lockKey, lockEntry);
    
    // Verify we successfully acquired the lock (handles race conditions)
    const verifyLock = await readJsonS3<DistributedLockEntry>(lockKey);
    if (verifyLock?.instanceId === INSTANCE_ID) {
             console.log(`[Bookmarks] Distributed lock acquired by ${INSTANCE_ID}`);
       return true;
     }
     
     console.log(`[Bookmarks] Lock acquisition race lost to ${verifyLock?.instanceId || 'unknown'}`);
     return false;
    
  } catch (error) {
    console.error("[Bookmarks] Error during distributed lock acquisition:", error);
    return false;
  }
}

/**
 * Releases a distributed lock by deleting the S3 lock file
 * @param lockKey - S3 key for the lock file
 */
async function releaseDistributedLock(lockKey: string): Promise<void> {
  try {
    // Verify we own the lock before releasing
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
    
    if (existingLock?.instanceId === INSTANCE_ID) {
      // Note: S3 doesn't have a native delete operation in our utils
      // We can simulate deletion by writing null or a tombstone
      await writeJsonS3(lockKey, null);
      console.log(`[Bookmarks] Distributed lock released by ${INSTANCE_ID}`);
    } else {
      console.warn(`[Bookmarks] Cannot release lock owned by ${existingLock?.instanceId || 'unknown'}`);
    }
  } catch (error) {
    console.error("[Bookmarks] Error during distributed lock release:", error);
  }
}

/**
 * Acquires the bookmark refresh lock using distributed locking
 * @returns Promise resolving to true if lock acquired, false otherwise
 */
async function acquireRefreshLock(): Promise<boolean> {
  return acquireDistributedLock(DISTRIBUTED_LOCK_S3_KEY, LOCK_TTL_MS);
}

/**
 * Releases the bookmark refresh lock
 */
async function releaseRefreshLock(): Promise<void> {
  await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY);
}

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
  if (!(await acquireRefreshLock())) {
    return null; // Lock not acquired
  }

  try {
    const bookmarks = await fetchExternalBookmarksWithRetry();
    if (bookmarks && bookmarks.length > 0) {
      console.log(`[Bookmarks] About to write ${bookmarks.length} bookmarks to S3 at key ${BOOKMARKS_S3_KEY_FILE}`);
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, bookmarks);
      console.log(`[Bookmarks] Completed write of ${bookmarks.length} bookmarks to S3`);
      ServerCacheInstance.setBookmarks(bookmarks);
      console.log(`[Bookmarks] Successfully refreshed and persisted ${bookmarks.length} bookmarks.`);
      return bookmarks;
    }
    console.warn('[Bookmarks] External fetch returned no bookmarks. Keeping existing cache.');
    // Return null to indicate fetch failure while preserving cache
    return null;
  } catch (error) {
    console.error('[Bookmarks] CRITICAL: Failed to refresh and persist bookmarks.', error);
    return null;
  } finally {
    await releaseRefreshLock();
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
  // Use globalThis.isBookmarkRefreshLocked for logging as isRefreshLocked is removed
  console.log(`[Bookmarks] getBookmarks called. skipExternalFetch=${skipExternalFetch}, cachedExists=${!!(cached?.bookmarks?.length)}, shouldRefresh=${shouldRefresh}, isRefreshLocked=${globalThis.isBookmarkRefreshLocked || false}`);

  // ALWAYS return cached data first if available (even if stale)
  if (cached?.bookmarks?.length) {
    console.log(`[Bookmarks] Returning ${cached.bookmarks.length} bookmarks from in-memory cache.`);
    
    // Trigger background refresh if needed (NON-BLOCKING)
    // Check globalThis lock directly here as refreshInBackground will also check it.
    if (!skipExternalFetch && !globalThis.isBookmarkRefreshLocked) {
      console.log('[Bookmarks] Triggering background refresh (non-blocking).');
      // Start background refresh without awaiting
      refreshInBackground().catch(error => {
        console.error('[Bookmarks] Background refresh failed (called from getBookmarks initial cache check):', error);
        // TODO: Send to error tracking service
        // e.g., trackError('bookmark_background_refresh_failed_initial_cache', error);
      });
    }
    
    return cached.bookmarks;
  }

  // No cached data - try S3 first
  try {
    const s3Bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_KEY_FILE);
    // Use globalThis.isBookmarkRefreshLocked for logging
    console.log(`[Bookmarks] S3 load returned ${s3Bookmarks?.length ?? 0} bookmarks (skipExternalFetch=${skipExternalFetch}, isRefreshLocked=${globalThis.isBookmarkRefreshLocked || false})`);
    if (Array.isArray(s3Bookmarks) && s3Bookmarks.length > 0) {
      console.log(`[Bookmarks] Loaded ${s3Bookmarks.length} bookmarks from S3.`);
      ServerCacheInstance.setBookmarks(s3Bookmarks);
      
      // Trigger background refresh if needed (NON-BLOCKING)
      // Check globalThis lock directly here
      if (!skipExternalFetch && !globalThis.isBookmarkRefreshLocked) {
        console.log('[Bookmarks] Triggering background refresh after S3 load (non-blocking).');
        refreshInBackground().catch(error => {
          console.error('[Bookmarks] Background refresh failed (called from getBookmarks after S3 load):', error);
          // TODO: Send to error tracking service
          // e.g., trackError('bookmark_background_refresh_failed_after_s3', error);
        });
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
  if (!(await acquireRefreshLock())) {
    console.log('[Bookmarks] Background refresh skipped - lock not acquired.');
    return;
  }

  console.log('[Bookmarks] Starting background refresh (lock acquired).');
  // Lock is acquired by acquireRefreshLock

  try {
    const freshBookmarks = await fetchExternalBookmarksWithRetry();
    
    if (freshBookmarks && freshBookmarks.length > 0) {
      console.log(`[Bookmarks] About to write ${freshBookmarks.length} bookmarks to S3 at key ${BOOKMARKS_S3_KEY_FILE} (background)`);
      await writeJsonS3(BOOKMARKS_S3_KEY_FILE, freshBookmarks);
      console.log(`[Bookmarks] Completed background write of ${freshBookmarks.length} bookmarks to S3`);
      ServerCacheInstance.setBookmarks(freshBookmarks);
      console.log(`[Bookmarks] Background refresh completed - updated cache with ${freshBookmarks.length} bookmarks.`);
    } else {
      console.warn('[Bookmarks] Background refresh failed - keeping existing cache.');
      // Keep existing cache valid - this was just a background refresh attempt
      console.log('[Bookmarks] Background refresh failed but keeping existing valid cache');
    }
  } catch (error) {
    console.error('[Bookmarks] Background refresh error:', error);
    // Keep existing cache valid - this was just a background refresh attempt
    console.log('[Bookmarks] Background refresh failed but keeping existing valid cache');
  } finally {
    await releaseRefreshLock();
    console.log('[Bookmarks] Background refresh completed (lock released).');
  }
}
