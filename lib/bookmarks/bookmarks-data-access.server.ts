/**
 * Bookmarks Data Access Module
 *
 * Handles fetching and caching of bookmark data across storage layers
 * Access pattern: In-memory Cache → S3 Storage → External API
 *
 * @module data-access/bookmarks
 */

import { randomInt } from "node:crypto";
import { readJsonS3, writeJsonS3, deleteFromS3 } from "@/lib/s3-utils";
import { ServerCacheInstance } from "@/lib/server-cache";
import { BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { UnifiedBookmark, DistributedLockEntry, RefreshBookmarksCallback } from "@/types";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";

// --- Configuration & Constants ---
const LOG_PREFIX = "[Bookmarks]";
const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;
const LOCK_TTL_MS = Number(process.env.BOOKMARKS_LOCK_TTL_MS) || 5 * 60 * 1000; // 5 minutes default (configurable via env)
const LOCK_CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // Check for stale locks every 2 minutes
const INSTANCE_ID = `instance-${randomInt(1000000, 9999999)}-${Date.now()}`;

// Module-scoped state for refresh lock status
let isRefreshLocked = false;
let lockCleanupInterval: NodeJS.Timeout | null = null;

// --- Bookmarks Data Access ---

let inFlightGetPromise: Promise<UnifiedBookmark[]> | null = null;

/**
 * S3-based distributed lock for coordinating bookmark refreshes across multiple instances
 */

/**
 * Attempts to acquire a distributed lock using S3 with atomic operations
 * @param lockKey - S3 key for the lock file
 * @param ttlMs - Time-to-live for the lock in milliseconds
 * @returns Promise resolving to true if lock acquired, false otherwise
 */
async function acquireDistributedLock(lockKey: string, ttlMs: number): Promise<boolean> {
  const lockEntry: DistributedLockEntry = {
    instanceId: INSTANCE_ID,
    acquiredAt: Date.now(),
    ttlMs,
  };

  try {
    // Use conditional write with IfNoneMatch to ensure atomic lock creation
    await writeJsonS3(lockKey, lockEntry, {
      // This will only succeed if the object doesn't exist
      IfNoneMatch: "*",
    });

    console.log(`${LOG_PREFIX} Distributed lock acquired atomically by ${INSTANCE_ID}`);
    return true;
  } catch (error: unknown) {
    // Check if error is due to precondition failure (lock already exists)
    if (
      error instanceof Error &&
      (error.name === "PreconditionFailed" ||
        (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 412)
    ) {
      // Lock already exists - check if it's expired
      try {
        const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
        if (existingLock && typeof existingLock === "object") {
          const now = Date.now();
          const lockAge = now - existingLock.acquiredAt;

          // If lock is still valid (not expired), acquisition fails
          if (lockAge < existingLock.ttlMs) {
            const remainingMs = existingLock.ttlMs - lockAge;
            console.log(
              `[Bookmarks] Distributed lock held by ${existingLock.instanceId}, ${Math.round(remainingMs / 1000)}s remaining`,
            );
            return false;
          }

          // Lock is expired - try to clean it up and retry
          console.log(`[Bookmarks] Found expired lock from ${existingLock.instanceId}, attempting cleanup`);
          await releaseDistributedLock(lockKey);

          // Retry lock acquisition
          return acquireDistributedLock(lockKey, ttlMs);
        }
      } catch (readError: unknown) {
        console.error("[Bookmarks] Error reading existing lock:", String(readError));
      }

      // Lock exists but we couldn't read it or handle it
      return false;
    }

    // Any other error
    console.error(
      "[Bookmarks] Error during atomic lock acquisition:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}

/**
 * Releases a distributed lock by deleting the S3 lock file
 * @param lockKey - S3 key for the lock file
 * @param forceRelease - Whether to force release even if not owned by this instance
 */
async function releaseDistributedLock(lockKey: string, forceRelease = false): Promise<void> {
  try {
    // Verify we own the lock before releasing (unless forcing)
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);

    if (existingLock?.instanceId === INSTANCE_ID || forceRelease) {
      // Actually delete the S3 object to release the lock
      await deleteFromS3(lockKey);
      console.log(`[Bookmarks] Distributed lock released ${forceRelease ? "(forced)" : ""} by ${INSTANCE_ID}`);
    } else if (existingLock) {
      // Only warn if lock exists but is owned by another instance
      console.warn(`[Bookmarks] Cannot release lock owned by ${existingLock.instanceId}`);
    }
    // If lock doesn't exist, stay silent - it's already released
  } catch (error: unknown) {
    // If the lock doesn't exist, that's fine - it's already released, stay silent
    if (
      error instanceof Error &&
      (error.name === "NoSuchKey" ||
        (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404)
    ) {
      return;
    }
    console.error("[Bookmarks] Error during distributed lock release:", String(error));
  }
}

/**
 * Cleans up stale locks that have exceeded their TTL
 * This helps recover from instances that crashed without releasing their locks
 */
async function cleanupStaleLocks(): Promise<void> {
  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(DISTRIBUTED_LOCK_S3_KEY);
    if (existingLock && typeof existingLock === "object") {
      const now = Date.now();
      const lockAge = now - existingLock.acquiredAt;

      // If lock is expired, clean it up
      if (lockAge > existingLock.ttlMs) {
        console.log(
          `[Bookmarks] Cleaning up stale lock from ${existingLock.instanceId} (aged ${Math.round(lockAge / 1000)}s)`,
        );
        await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY, true);
      }
    }
  } catch (error: unknown) {
    // Ignore errors - lock might not exist or we might not have permissions
    if (
      !(
        error instanceof Error &&
        (error.name === "NoSuchKey" ||
          (error as { $metadata?: { httpStatusCode: number } }).$metadata?.httpStatusCode === 404)
      )
    ) {
      console.debug("[Bookmarks] Error checking for stale locks:", String(error));
    }
  }
}

/**
 * Acquires the bookmark refresh lock using distributed locking
 * @returns Promise resolving to true if lock acquired, false otherwise
 */
async function acquireRefreshLock(): Promise<boolean> {
  const locked = await acquireDistributedLock(DISTRIBUTED_LOCK_S3_KEY, LOCK_TTL_MS);
  if (locked) {
    isRefreshLocked = true;
  }
  return locked;
}

/**
 * Releases the bookmark refresh lock
 */
async function releaseRefreshLock(): Promise<void> {
  try {
    await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY);
  } finally {
    isRefreshLocked = false;
  }
}

/**
 * Stores the refresh callback function
 * This is set by the bookmarks module to avoid circular dependencies
 */
let refreshBookmarksCallback: RefreshBookmarksCallback | null = null;

/**
 * Track initialization state to ensure singleton behavior
 */
let isInitialized = false;

/**
 * Track in-flight refresh operations to prevent duplicates
 */
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

/**
 * Sets the callback function for refreshing bookmarks
 * @param callback - Function that fetches fresh bookmarks from external API
 */
export function setRefreshBookmarksCallback(callback: RefreshBookmarksCallback): void {
  refreshBookmarksCallback = callback;
}

/**
 * Initialize the bookmarks data access layer
 * This ensures the refresh callback is properly set up and starts lock cleanup
 * NOTE: This function is now SYNCHRONOUS to prevent blocking I/O during module initialization
 */
export function initializeBookmarksDataAccess(): void {
  // Return if already initialized
  if (isInitialized) {
    return;
  }

  // Mark as initialized immediately to prevent duplicate initialization
  isInitialized = true;

  // Set up the refresh callback asynchronously (non-blocking)
  if (!refreshBookmarksCallback) {
    // Dynamically import to avoid circular dependency at module load time
    // This is now fire-and-forget to prevent blocking
    import("@/lib/bookmarks")
      .then(({ refreshBookmarksData }) => {
        setRefreshBookmarksCallback(refreshBookmarksData);
        console.log("[Bookmarks] Data access layer initialized with refresh callback");
      })
      .catch((error) => {
        console.error("[Bookmarks] Failed to initialize refresh callback:", error);
      });
  }

  // Start the lock cleanup interval if not already running
  if (!lockCleanupInterval) {
    // Do an immediate cleanup check on startup (non-blocking)
    cleanupStaleLocks().catch((error) => {
      console.debug("[Bookmarks] Initial lock cleanup check failed:", String(error));
    });

    // Then schedule regular cleanup
    lockCleanupInterval = setInterval(() => {
      cleanupStaleLocks().catch((error) => {
        console.debug("[Bookmarks] Scheduled lock cleanup failed:", String(error));
      });
    }, LOCK_CLEANUP_INTERVAL_MS);

    // Allow the process to exit naturally if this is the only pending handle (e.g. in Jest)
    // This prevents "Jest did not exit one second after the test run" warnings/hangs.
    lockCleanupInterval.unref();

    console.log("[Bookmarks] Started lock cleanup interval (every 2 minutes)");
  }

  console.log("[Bookmarks] Data access layer initialization completed (non-blocking)");
}

/**
 * Cleanup function to stop the lock cleanup interval
 * Should be called on application shutdown
 */
export function cleanupBookmarksDataAccess(): void {
  if (lockCleanupInterval) {
    clearInterval(lockCleanupInterval);
    lockCleanupInterval = null;
    console.log("[Bookmarks] Stopped lock cleanup interval");
  }

  // Release any locks held by this instance
  if (isRefreshLocked) {
    releaseRefreshLock().catch((error) => {
      console.error("[Bookmarks] Failed to release lock on cleanup:", error);
    });
  }

  // Reset initialization state
  isInitialized = false;
}

export async function refreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  // Check if a refresh is already in progress
  if (inFlightRefreshPromise) {
    console.log("[Bookmarks] Refresh already in progress, returning existing promise");
    return inFlightRefreshPromise;
  }

  // Start new refresh operation
  inFlightRefreshPromise = (async () => {
    try {
      if (!(await acquireRefreshLock())) {
        return null; // Lock not acquired
      }

      try {
        // Use the callback to get fresh data from the business layer
        if (!refreshBookmarksCallback) {
          // During build time or when callback isn't set, gracefully handle by returning null
          console.warn(
            "[Bookmarks] Refresh callback not set. This is expected during build time or initial module load.",
          );
          await releaseRefreshLock();
          return null;
        }

        const bookmarks = await refreshBookmarksCallback();

        if (!bookmarks) {
          console.log("[Bookmarks] Refresh callback returned null, nothing to persist.");
          return null;
        }

        // Validate before persisting
        const validation = validateBookmarkDataset(bookmarks);
        if (!validation.isValid) {
          console.error(
            "[Bookmarks][SAFEGUARD] Refusing to overwrite bookmarks.json in S3 – dataset failed validation checks.",
          );
          console.error(`[Bookmarks][SAFEGUARD] Reason: ${validation.reason}`);
          return null;
        }

        // Write to S3 and update cache
        console.log(`[Bookmarks] About to write ${bookmarks.length} bookmarks to S3 at key ${BOOKMARKS_S3_PATHS.FILE}`);
        await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarks);
        console.log(`[Bookmarks] Completed write of ${bookmarks.length} bookmarks to S3`);
        ServerCacheInstance.setBookmarks(bookmarks);
        console.log(`[Bookmarks] Successfully refreshed and persisted ${bookmarks.length} bookmarks.`);

        return bookmarks;
      } catch (error: unknown) {
        console.error(
          "[Bookmarks] CRITICAL: Failed to refresh and persist bookmarks.",
          error instanceof Error ? error.message : String(error),
        );
        return null;
      } finally {
        await releaseRefreshLock();
      }
    } finally {
      // Clear the in-flight promise when done
      inFlightRefreshPromise = null;
    }
  })();

  return inFlightRefreshPromise;
}

/**
 * Cool-down window for background refreshes.
 * Multiple concurrent page requests can call `getBookmarks()` in quick succession –
 * each call currently tries to kick off a non-blocking background refresh whenever the
 * cache is considered fresh. While the distributed lock prevents duplicate *network*
 * crawls, each attempted refresh still spins up promise scaffolding, pollutes logs,
 * and can thrash Fast Refresh in development.
 *
 * To keep things quiet we enforce a simple, per-process cool-down.  After a refresh
 * *starts* we won't try again for at least this many milliseconds. 15 minutes strikes
 * a good balance between data freshness and dev server stability.
 */
const BACKGROUND_REFRESH_COOLDOWN_MS = 15 * 60 * 1000; // 15 mins
let lastBackgroundRefreshStart = 0;

function canStartBackgroundRefresh(): boolean {
  if (inFlightRefreshPromise) return false; // already in progress (fast path)
  const now = Date.now();
  return now - lastBackgroundRefreshStart >= BACKGROUND_REFRESH_COOLDOWN_MS;
}

function markBackgroundRefreshStarted(): void {
  lastBackgroundRefreshStart = Date.now();
}

/**
 * Retrieves bookmark data using a hierarchical strategy: in-memory cache, S3 storage, and external API as fallback
 *
 * @param skipExternalFetch - If true, bypasses the external API and relies solely on cache or S3. Defaults to false
 * @returns Promise resolving to an array of UnifiedBookmark objects, or an empty array if none are available
 */
export async function getBookmarks(skipExternalFetch = false): Promise<UnifiedBookmark[]> {
  // Fast path - check memory cache first (outside coalescing)
  const cached = ServerCacheInstance.getBookmarks();
  const shouldRefresh = ServerCacheInstance.shouldRefreshBookmarks();
  console.log(
    `[Bookmarks] getBookmarks called. skipExternalFetch=${skipExternalFetch}, cachedExists=${!!(cached?.bookmarks?.length)}, shouldRefresh=${shouldRefresh}, isRefreshLocked=${isRefreshLocked}`,
  );

  // ALWAYS return cached data first if available and valid
  if (cached?.bookmarks?.length) {
    // Validate cached data before returning
    const validation = validateBookmarkDataset(cached.bookmarks);
    if (!validation.isValid) {
      console.error("[Bookmarks][VALIDATION] Cached data failed validation checks. Not returning invalid cache.");
      console.error(`[Bookmarks][VALIDATION] Reason: ${validation.reason}`);
      // If validation fails, proceed as if cache was empty by not returning here.
    } else {
      console.log(`[Bookmarks] Returning ${cached.bookmarks.length} bookmarks from in-memory cache.`);

      // Only trigger a background refresh if the data is considered stale.
      if (shouldRefresh && canStartBackgroundRefresh()) {
        console.log("[Bookmarks] Cached data is stale – triggering background refresh (non-blocking).");
        markBackgroundRefreshStarted();
        // Start background refresh without awaiting
        refreshInBackground().catch((error) => {
          console.error("[Bookmarks] Background refresh failed (called from getBookmarks cache stale check):", error);
        });
      }

      return cached.bookmarks;
    }
  }

  // Use coalescing for any operation that needs to fetch data
  if (inFlightGetPromise) {
    console.log("[Bookmarks] Using existing in-flight getBookmarks promise");
    return inFlightGetPromise;
  }

  inFlightGetPromise = (async (): Promise<UnifiedBookmark[]> => {
    try {
      // No cached data - try S3 first
      try {
        const s3Bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);

        if (s3Bookmarks && Array.isArray(s3Bookmarks)) {
          console.log(`${LOG_PREFIX} Successfully fetched ${s3Bookmarks.length} bookmarks from S3`);

          // Validate before caching to prevent bad data propagation
          const { isValid } = validateBookmarkDataset(s3Bookmarks);
          if (!isValid) {
            console.error(
              `${LOG_PREFIX}[S3-VALIDATION] S3 bookmark data is invalid, returning empty array to prevent further issues`,
            );
            // Do not cache invalid data
            return [];
          }

          // Update in-memory cache with S3 data
          ServerCacheInstance.setBookmarks(s3Bookmarks);

          // Start a background refresh if needed, but don't block
          void refreshInBackground();

          return s3Bookmarks;
        }
      } catch (error) {
        if (error instanceof Error && error.name === "NoSuchKey") {
          console.warn(`${LOG_PREFIX} No bookmarks file found in S3. Triggering external refresh.`);
        } else {
          console.error(`${LOG_PREFIX} Failed to fetch from S3:`, String(error));
        }
        // S3 fetch failed, proceed to external fetch
      }

      // If S3 is empty or fails, fetch from external source and persist
      console.log(`${LOG_PREFIX} No valid data in cache or S3, fetching from external source`);
      const refreshedBookmarks = await refreshAndPersistBookmarks();
      return refreshedBookmarks ?? [];
    } finally {
      inFlightGetPromise = null;
    }
  })();

  return inFlightGetPromise;
}

/**
 * Performs background refresh without blocking the current request
 */
async function refreshInBackground(): Promise<void> {
  console.log("[Bookmarks] Starting background refresh.");
  const result = await refreshAndPersistBookmarks();
  if (result) {
    console.log(`[Bookmarks] Background refresh completed - updated cache with ${result.length} bookmarks.`);
  } else if (inFlightRefreshPromise) {
    console.log("[Bookmarks] Background refresh skipped - another refresh is already in progress.");
  } else {
    console.log("[Bookmarks] Background refresh completed - no updates made.");
  }
}

// ---------------------------------------------------------------------------
// Test environment compatibility: when tests mock "@/lib/bookmarks" they
// expect the mocked `getBookmarks` to also be returned from this module path.
// We detect that scenario and, if possible, re-export the mocked version so
// that both import paths resolve to the same (mocked) implementation.
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === "test") {
  try {
    // Dynamically require to avoid circular ES import issues in non-test envs
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
    const bookmarksIndex = require("./index");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (bookmarksIndex?.getBookmarks && typeof bookmarksIndex.getBookmarks === "function") {
      // Re-assign CommonJS exports so jest picks up the mocked fn
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      module.exports.getBookmarks = bookmarksIndex.getBookmarks;
    }
  } catch {
    /* noop */
  }
}
