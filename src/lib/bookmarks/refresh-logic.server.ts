/**
 * @file Refresh logic for bookmarks
 * @module lib/bookmarks/refresh-logic.server
 *
 * Handles the logic for refreshing bookmark data from external sources,
 * validating changes, and orchestrating persistence.
 */

import { readJsonS3Optional, writeJsonS3 } from "@/lib/s3/json";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { createDistributedLock, cleanupStaleLocks } from "@/lib/utils/s3-distributed-lock.server";
import type { UnifiedBookmark, RefreshBookmarksCallback } from "@/types";
import {
  bookmarksIndexSchema,
  type BookmarksIndex,
  type BookmarkSlugMapping,
  unifiedBookmarksArraySchema,
} from "@/types/bookmark";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import { saveSlugMapping, generateSlugMapping } from "@/lib/bookmarks/slug-manager";
import {
  isBookmarkServiceLoggingEnabled,
  LOG_PREFIX,
  BOOKMARK_SERVICE_LOG_CATEGORY,
  METADATA_REFRESH_MAX_ITEMS,
} from "@/lib/bookmarks/config";
import { getDeterministicTimestamp } from "@/lib/server-cache";
import { processBookmarksInBatches } from "@/lib/bookmarks/enrich-opengraph";
import {
  writePaginatedBookmarks,
  writeBookmarkMasterFiles,
  persistTagFilteredBookmarksToS3,
  writeLocalBookmarksCache,
} from "@/lib/bookmarks/persistence.server";

/**
 * Attach slugs from mapping to bookmarks array.
 * Throws if any bookmark is missing from the mapping.
 *
 * @param bookmarks - Bookmarks to attach slugs to
 * @param mapping - Slug mapping containing id-to-slug entries
 * @param context - Context string for error messages (e.g., "metadata refresh")
 * @returns Bookmarks with slug property populated
 */
function attachSlugsToBookmarks(
  bookmarks: UnifiedBookmark[],
  mapping: BookmarkSlugMapping,
  context: string,
): UnifiedBookmark[] {
  return bookmarks.map((b) => {
    const entry = mapping.slugs[b.id];
    if (!entry) {
      throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (${context})`);
    }
    return { ...b, slug: entry.slug };
  });
}

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;

// Parse LOCK_TTL_MS with robust validation
const RAW_LOCK_TTL = process.env.BOOKMARKS_LOCK_TTL_MS;
const PARSED_LOCK_TTL = RAW_LOCK_TTL != null ? Number(RAW_LOCK_TTL) : Number.NaN;
const DEFAULT_LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes - covers longest OpenGraph enrichment cycle
const LOCK_TTL_MS =
  Number.isFinite(PARSED_LOCK_TTL) && PARSED_LOCK_TTL > 0
    ? Math.floor(PARSED_LOCK_TTL)
    : DEFAULT_LOCK_TTL_MS;

if (RAW_LOCK_TTL && (!Number.isFinite(PARSED_LOCK_TTL) || PARSED_LOCK_TTL <= 0)) {
  envLogger.debug(
    "BOOKMARKS_LOCK_TTL_MS is invalid or <= 0; defaulting to 30 minutes",
    { RAW_LOCK_TTL },
    { category: "BookmarksDataAccess" },
  );
}

// Create the distributed lock instance for bookmarks refresh
const bookmarksLock = createDistributedLock({
  lockKey: BOOKMARKS_S3_PATHS.LOCK,
  ttlMs: LOCK_TTL_MS,
  logCategory: "BookmarksLock",
});

const LOCK_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

let isRefreshLocked = false;
let lockCleanupInterval: NodeJS.Timeout | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

// Compute a lightweight signature over display metadata that affect list/detail rendering
function computeDisplaySignature(bookmarks: UnifiedBookmark[]): string {
  let acc = "";
  for (const b of bookmarks) {
    // Use only fields that influence visible metadata
    acc += `${b.id}|${b.title}|${b.description ?? ""}|${b.ogTitle ?? ""}|${b.ogDescription ?? ""}||`;
  }
  return acc;
}

// Attempt a metadata-only refresh (OpenGraph title/description) when dataset shape is unchanged
async function refreshMetadataIfNeeded(
  input: UnifiedBookmark[],
): Promise<{ changed: boolean; updated: UnifiedBookmark[] }> {
  const beforeSig = computeDisplaySignature(input);
  // Conservative cap to avoid excessive network during periodic runs
  const updated = await processBookmarksInBatches(input, false, true, false, {
    metadataOnly: true,
    refreshMetadataEvenIfImagePresent: true,
    maxItems: METADATA_REFRESH_MAX_ITEMS,
  });
  const afterSig = computeDisplaySignature(updated);
  return { changed: beforeSig !== afterSig, updated };
}

export const acquireRefreshLock = async (): Promise<boolean> => {
  const locked = await bookmarksLock.acquire();
  if (locked) isRefreshLocked = true;
  return locked;
};

export const releaseRefreshLock = async (): Promise<void> => {
  try {
    await bookmarksLock.release();
  } finally {
    isRefreshLocked = false;
  }
};

let refreshBookmarksCallback: RefreshBookmarksCallback | null = null;
let isInitialized = false;

export const setRefreshBookmarksCallback = (callback: RefreshBookmarksCallback): void => {
  refreshBookmarksCallback = callback;
};

export function initializeBookmarksDataAccess(): void {
  if (isInitialized) return;
  isInitialized = true;
  if (!refreshBookmarksCallback) {
    import("@/lib/bookmarks")
      .then(({ refreshBookmarksData }) => setRefreshBookmarksCallback(refreshBookmarksData))
      .catch((error) =>
        console.error("[Bookmarks] Failed to initialize refresh callback:", String(error)),
      );
  }
  if (!lockCleanupInterval) {
    if (!isRefreshLocked) {
      cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch((error) =>
        envLogger.debug(
          "Initial lock cleanup failed",
          { error: String(error) },
          { category: "BookmarksLock" },
        ),
      );
    }
    lockCleanupInterval = setInterval(() => {
      if (isRefreshLocked) {
        envLogger.debug(
          "Skipping stale lock cleanup while current process holds the distributed lock",
          undefined,
          {
            category: "BookmarksLock",
          },
        );
        return;
      }
      cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch((error) =>
        envLogger.debug(
          "Periodic lock cleanup failed",
          { error: String(error) },
          { category: "BookmarksLock" },
        ),
      );
    }, LOCK_CLEANUP_INTERVAL_MS);
    if (lockCleanupInterval.unref) lockCleanupInterval.unref();
  }
}

export function cleanupBookmarksDataAccess(): void {
  if (lockCleanupInterval) {
    clearInterval(lockCleanupInterval);
    lockCleanupInterval = null;
  }
  if (isRefreshLocked)
    releaseRefreshLock().catch((error) =>
      console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)),
    );
}

/** Check if bookmarks have changed */
async function hasBookmarksChanged(newBookmarks: UnifiedBookmark[]): Promise<boolean> {
  const existingIndex = await readJsonS3Optional<BookmarksIndex>(
    BOOKMARKS_S3_PATHS.INDEX,
    bookmarksIndexSchema,
  );
  if (!existingIndex) return true;
  if (existingIndex.count !== newBookmarks.length) return true;
  return calculateBookmarksChecksum(newBookmarks) !== existingIndex.checksum;
}

async function saveSlugMappingOrThrow(
  bookmarks: UnifiedBookmark[],
  logSuffix: string,
): Promise<void> {
  try {
    await saveSlugMapping(bookmarks, true);
    logBookmarkDataAccessEvent("Saved slug mapping", {
      context: logSuffix,
      bookmarkCount: bookmarks.length,
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error(
      `${LOG_PREFIX} CRITICAL: Failed to save slug mapping ${logSuffix}:`,
      normalizedError,
    );
    throw new Error(`Failed to save slug mapping: ${normalizedError.message}`, { cause: error });
  }
}

/** Core refresh logic - only process new/changed bookmarks */
export async function selectiveRefreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (!refreshBookmarksCallback) {
    console.error(`${LOG_PREFIX} Refresh callback not set.`);
    return null;
  }
  try {
    const allIncomingBookmarks = await refreshBookmarksCallback();
    if (!allIncomingBookmarks) return null;
    const hasChanged = await hasBookmarksChanged(allIncomingBookmarks);
    if (!hasChanged) {
      logBookmarkDataAccessEvent("No changes detected, skipping bookmarks write");

      const now = getDeterministicTimestamp();
      const existingIndex = await readJsonS3Optional<BookmarksIndex>(
        BOOKMARKS_S3_PATHS.INDEX,
        bookmarksIndexSchema,
      );
      const baseIndex: Omit<BookmarksIndex, "changeDetected"> = {
        count: existingIndex?.count ?? allIncomingBookmarks.length,
        totalPages:
          existingIndex?.totalPages ?? Math.ceil(allIncomingBookmarks.length / BOOKMARKS_PER_PAGE),
        pageSize: existingIndex?.pageSize ?? BOOKMARKS_PER_PAGE,
        lastModified:
          existingIndex?.lastModified ?? new Date(getDeterministicTimestamp()).toISOString(),
        lastFetchedAt: now,
        lastAttemptedAt: now,
        checksum: existingIndex?.checksum ?? calculateBookmarksChecksum(allIncomingBookmarks),
      };

      // Ensure slug mapping exists even when no changes detected (idempotent)
      await saveSlugMappingOrThrow(allIncomingBookmarks, "(no-change path)");

      // Attempt metadata-only refresh to capture OG/title/description changes even when raw dataset unchanged
      let metadataChanged = false;
      let refreshed = allIncomingBookmarks;
      try {
        const res = await refreshMetadataIfNeeded(allIncomingBookmarks);
        metadataChanged = res.changed;
        refreshed = res.updated;
      } catch (err) {
        console.warn(
          `${LOG_PREFIX} Metadata-only refresh failed, continuing with existing dataset:`,
          String(err),
        );
      }

      if (!metadataChanged) {
        await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, { ...baseIndex, changeDetected: false });
        return allIncomingBookmarks;
      }

      const mapping = generateSlugMapping(refreshed);
      const bookmarksWithSlugs = attachSlugsToBookmarks(refreshed, mapping, "metadata refresh");

      await writeBookmarkMasterFiles(bookmarksWithSlugs);
      await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, {
        ...baseIndex,
        lastModified: new Date(getDeterministicTimestamp()).toISOString(),
        checksum: calculateBookmarksChecksum(bookmarksWithSlugs),
        changeDetected: true,
      });

      // Local cache write is best-effort; S3 is the primary store
      const localCacheResult = await writeLocalBookmarksCache(
        bookmarksWithSlugs,
        "metadata refresh",
      );
      if (!localCacheResult.success) {
        envLogger.debug(
          "Local cache write failed during metadata refresh",
          { error: localCacheResult.error?.message },
          { category: LOG_PREFIX },
        );
      }

      return bookmarksWithSlugs;
    }
    logBookmarkDataAccessEvent("Changes detected, persisting bookmarks");
    const mapping = await writePaginatedBookmarks(allIncomingBookmarks);
    const bookmarksWithSlugs = attachSlugsToBookmarks(
      allIncomingBookmarks,
      mapping,
      "change-detected",
    );
    await writeBookmarkMasterFiles(bookmarksWithSlugs);

    // Local cache write is best-effort; S3 is the primary store
    const localCacheResult = await writeLocalBookmarksCache(
      bookmarksWithSlugs,
      "change-detected path",
    );
    if (!localCacheResult.success) {
      envLogger.debug(
        "Local cache write failed during change-detected path",
        { error: localCacheResult.error?.message },
        { category: LOG_PREFIX },
      );
    }
    await persistTagFilteredBookmarksToS3(allIncomingBookmarks);
    return allIncomingBookmarks;
  } catch (error: unknown) {
    console.error(`${LOG_PREFIX} Error during selective refresh:`, String(error));
    // Propagate the error to ensure the data update process fails correctly.
    throw error;
  }
}

export function refreshAndPersistBookmarks(force = false): Promise<UnifiedBookmark[] | null> {
  if (inFlightRefreshPromise) return inFlightRefreshPromise;
  const promise = (async () => {
    if (isRefreshLocked || !(await acquireRefreshLock())) return null;
    try {
      const useSelectiveRefresh = process.env.SELECTIVE_OG_REFRESH === "true";
      if (!useSelectiveRefresh) {
        if (!refreshBookmarksCallback) return null;
        const freshBookmarks = await refreshBookmarksCallback(force);
        if (freshBookmarks && freshBookmarks.length > 0) {
          const { isValid } = validateBookmarkDataset(freshBookmarks);
          if (isValid) {
            const hasChanged = await hasBookmarksChanged(freshBookmarks);
            if (hasChanged || force) {
              logBookmarkDataAccessEvent(
                force ? "Forcing S3 write" : "Changes detected, writing to S3",
              );
              const mapping = await writePaginatedBookmarks(freshBookmarks);
              const bookmarksWithSlugs = attachSlugsToBookmarks(freshBookmarks, mapping, "force");
              await writeBookmarkMasterFiles(bookmarksWithSlugs);
              await persistTagFilteredBookmarksToS3(freshBookmarks);
            } else {
              logBookmarkDataAccessEvent("No changes detected, skipping heavy S3 writes");
              // Still update index freshness to reflect successful refresh
              const now = getDeterministicTimestamp();
              const existingIndex = await readJsonS3Optional<BookmarksIndex>(
                BOOKMARKS_S3_PATHS.INDEX,
                bookmarksIndexSchema,
              );
              const updatedIndex: BookmarksIndex = {
                count: existingIndex?.count ?? freshBookmarks.length,
                totalPages:
                  existingIndex?.totalPages ??
                  Math.ceil(freshBookmarks.length / BOOKMARKS_PER_PAGE),
                pageSize: existingIndex?.pageSize ?? BOOKMARKS_PER_PAGE,
                lastModified:
                  existingIndex?.lastModified ??
                  new Date(getDeterministicTimestamp()).toISOString(),
                lastFetchedAt: now,
                lastAttemptedAt: now,
                checksum: existingIndex?.checksum ?? calculateBookmarksChecksum(freshBookmarks),
                changeDetected: false,
              };
              await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, updatedIndex);
              // Ensure slug mapping exists even when no changes detected (idempotent)
              await saveSlugMappingOrThrow(freshBookmarks, "no-change path");

              // Attempt metadata-only refresh (captures OG/title/description changes)
              let metadataChanged = false;
              let refreshed = freshBookmarks;
              try {
                const res = await refreshMetadataIfNeeded(freshBookmarks);
                metadataChanged = res.changed;
                refreshed = res.updated;
              } catch (err) {
                console.warn(
                  `${LOG_PREFIX} Metadata-only refresh failed (default path):`,
                  String(err),
                );
              }

              // Generate mapping and write FILE (always), and optionally rewrite pages/tags if metadata changed
              const mapping = generateSlugMapping(refreshed);
              const bookmarksWithSlugs = attachSlugsToBookmarks(
                refreshed,
                mapping,
                "non-selective",
              );
              await writeBookmarkMasterFiles(bookmarksWithSlugs);
              if (metadataChanged) {
                logBookmarkDataAccessEvent(
                  "Metadata-only changes detected; master FILE updated (pages/tags refresh deferred)",
                );
                // NOTE: Removed aggressive full rewrite to prevent S3 write storms
                // Pages/tags will be refreshed on next actual dataset change (max 2 hours)
                // This prevents 120+ S3 writes when only metadata changed
              }

              // Local cache write is best-effort; S3 is the primary store
              const localCacheResult = await writeLocalBookmarksCache(
                bookmarksWithSlugs,
                "no-change path",
              );
              if (!localCacheResult.success) {
                envLogger.debug(
                  "Local cache write failed during no-change path",
                  { error: localCacheResult.error?.message },
                  { category: LOG_PREFIX },
                );
              }
            }
            // Heartbeat write (tiny file)
            void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
              runAt: getDeterministicTimestamp(),
              success: true,
              changeDetected: hasChanged || !!force,
            }).catch(() => void 0);
            return freshBookmarks;
          }
          console.warn(`${LOG_PREFIX} Freshly fetched bookmarks are invalid.`);
          return null;
        }
        // If we get an empty array, try to return existing S3 data as fallback
        console.warn(
          `${LOG_PREFIX} No bookmarks returned from refresh (likely missing API config), attempting S3 fallback`,
        );
        try {
          const existingBookmarks = await readJsonS3Optional<UnifiedBookmark[]>(
            BOOKMARKS_S3_PATHS.FILE,
            unifiedBookmarksArraySchema,
          );
          if (
            existingBookmarks &&
            Array.isArray(existingBookmarks) &&
            existingBookmarks.length > 0
          ) {
            logBookmarkDataAccessEvent("Returning existing bookmarks from S3 fallback", {
              bookmarkCount: existingBookmarks.length,
            });
            // Write heartbeat to record successful fallback
            void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
              runAt: getDeterministicTimestamp(),
              success: true,
              changeDetected: false,
              usedFallback: true,
              usedFallbackReason: "Refresh returned empty array",
            }).catch(() => void 0);
            return existingBookmarks;
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Failed to read existing bookmarks from S3:`, String(error));
        }
        return null;
      }
      const sel = await selectiveRefreshAndPersistBookmarks();
      // Heartbeat for selective path
      void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
        runAt: getDeterministicTimestamp(),
        success: !!sel,
        changeDetected: !!sel, // conservative signal
      }).catch(() => void 0);
      return sel;
    } catch (error: unknown) {
      console.error(`${LOG_PREFIX} Failed to refresh bookmarks:`, String(error));
      // Failure heartbeat
      void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
        runAt: getDeterministicTimestamp(),
        success: false,
        changeDetected: false,
        error: String(error),
      }).catch(() => void 0);
      // Propagate the error to fail the CI/CD process
      throw error;
    } finally {
      await releaseRefreshLock();
    }
  })();
  inFlightRefreshPromise = promise;
  void promise.finally(() => {
    inFlightRefreshPromise = null;
  });
  return promise;
}
