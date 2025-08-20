/** Bookmarks data access: In-memory → S3 → External API */

import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import { createDistributedLock, cleanupStaleLocks } from "@/lib/utils/s3-distributed-lock.server";
import type { UnifiedBookmark, RefreshBookmarksCallback } from "@/types";
import type { BookmarksIndex, BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
import { BookmarksIndexSchema } from "@/lib/schemas/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import {
  normalizeBookmarkTag,
  calculateBookmarksChecksum,
  stripImageData,
  normalizePageBookmarkTags,
} from "@/lib/bookmarks/utils";
import { saveSlugMapping, generateSlugMapping } from "@/lib/bookmarks/slug-manager";
import { getEnvironment } from "@/lib/config/environment";
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";
import { promises as fs } from "node:fs";
import path from "node:path";

const LOCAL_BOOKMARKS_PATH = path.join(process.cwd(), "lib", "data", "bookmarks.json");

// Runtime-safe cache wrappers for experimental Next.js APIs
// These functions are only available in Next.js request context with experimental.useCache enabled
// They will be no-ops when called from CLI scripts or outside request context

// Shared helpers for CLI context detection
const isCliLikeContext = (): boolean => {
  const argv1 = process.argv[1] || "";
  // Cross-platform check for scripts directory
  const inScriptsDir = /(^|[\\/])scripts[\\/]/.test(argv1);
  return (
    inScriptsDir ||
    process.argv.includes("data-updater") ||
    process.argv.includes("reset-and-regenerate") ||
    process.argv.includes("regenerate-content") ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
};

const shouldLogCacheWarning = (): boolean =>
  process.env.NODE_ENV === "development" && !isCliLikeContext() && !process.env.SUPPRESS_CACHE_WARNINGS;
const safeCacheLife = (
  profile:
    | "default"
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "max"
    | { stale?: number; revalidate?: number; expire?: number },
): void => {
  try {
    // Only attempt to use cacheLife if we're in a Next.js request context
    // CLI scripts and data-updater won't have access to these functions
    if (typeof cacheLife === "function" && !isCliLikeContext()) {
      cacheLife(profile);
    }
  } catch (err) {
    // Silently ignore - expected when running outside Next.js request context
    // This is normal for CLI scripts, data-updater, and environments without experimental.useCache
    if (shouldLogCacheWarning()) {
      console.warn("[Bookmarks] cacheLife not available:", err);
    }
  }
};
const safeCacheTag = (...tags: string[]): void => {
  try {
    // Only attempt to use cacheTag if we're in a Next.js request context
    if (typeof cacheTag === "function" && !isCliLikeContext()) {
      for (const tag of new Set(tags)) cacheTag(tag);
    }
  } catch (err) {
    // Silently ignore - expected when running outside Next.js request context
    if (shouldLogCacheWarning()) {
      console.warn("[Bookmarks] cacheTag not available:", err);
    }
  }
};
const safeRevalidateTag = (...tags: string[]): void => {
  try {
    // Only attempt to use revalidateTag if we're in a Next.js request context
    if (typeof revalidateTag === "function" && !isCliLikeContext()) {
      for (const tag of new Set(tags)) revalidateTag(tag);
    }
  } catch (err) {
    // Silently ignore - expected when running outside Next.js request context
    if (shouldLogCacheWarning()) {
      console.warn("[Bookmarks] revalidateTag not available:", err);
    }
  }
};

const ENABLE_TAG_PERSISTENCE = process.env.ENABLE_TAG_PERSISTENCE !== "false";

// Default to no limit (persist all tags) when env var not set or invalid
const RAW_MAX_TAGS = process.env.MAX_TAGS_TO_PERSIST;
const PARSED_MAX_TAGS = RAW_MAX_TAGS != null ? Number(RAW_MAX_TAGS) : Number.NaN;
const MAX_TAGS_TO_PERSIST =
  Number.isFinite(PARSED_MAX_TAGS) && PARSED_MAX_TAGS > 0
    ? Math.floor(PARSED_MAX_TAGS)
    : Number.MAX_SAFE_INTEGER;

if (RAW_MAX_TAGS && (!Number.isFinite(PARSED_MAX_TAGS) || PARSED_MAX_TAGS <= 0)) {
  envLogger.debug(
    "MAX_TAGS_TO_PERSIST is invalid or <= 0; defaulting to unlimited persistence",
    { RAW_MAX_TAGS },
    { category: "BookmarksDataAccess" },
  );
}

// In-memory runtime cache for the full bookmarks dataset to prevent repeated S3 reads
// This is a temporary runtime cache, NOT S3 persistence
const FULL_DATASET_MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let fullDatasetMemoryCache: { data: UnifiedBookmark[]; timestamp: number } | null = null;

// In-process short-TTL cache parameters (centralized in lib/cache; local cache removed)

const LOG_PREFIX = "[BookmarksDataAccess]";
const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;

// Parse LOCK_TTL_MS with robust validation
const RAW_LOCK_TTL = process.env.BOOKMARKS_LOCK_TTL_MS;
const PARSED_LOCK_TTL = RAW_LOCK_TTL != null ? Number(RAW_LOCK_TTL) : Number.NaN;
const LOCK_TTL_MS =
  Number.isFinite(PARSED_LOCK_TTL) && PARSED_LOCK_TTL > 0
    ? Math.floor(PARSED_LOCK_TTL)
    : 5 * 60 * 1000; // Default: 5 minutes

if (RAW_LOCK_TTL && (!Number.isFinite(PARSED_LOCK_TTL) || PARSED_LOCK_TTL <= 0)) {
  envLogger.debug(
    "BOOKMARKS_LOCK_TTL_MS is invalid or <= 0; defaulting to 5 minutes",
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
let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

const isS3Error = (err: unknown): err is { $metadata?: { httpStatusCode?: number } } =>
  typeof err === "object" && err !== null && "$metadata" in err;


const acquireRefreshLock = async (): Promise<boolean> => {
  const locked = await bookmarksLock.acquire();
  if (locked) isRefreshLocked = true;
  return locked;
};

const releaseRefreshLock = async (): Promise<void> => {
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
      .catch((error) => console.error("[Bookmarks] Failed to initialize refresh callback:", String(error)));
  }
  if (!lockCleanupInterval) {
    cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch((error) =>
      envLogger.debug("Initial lock cleanup failed", { error: String(error) }, { category: "BookmarksLock" }),
    );
    lockCleanupInterval = setInterval(() => {
      cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch((error) =>
        envLogger.debug("Periodic lock cleanup failed", { error: String(error) }, { category: "BookmarksLock" }),
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
  try {
    const existingIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
    if (!existingIndex) return true;
    if (existingIndex.count !== newBookmarks.length) return true;
    return calculateBookmarksChecksum(newBookmarks) !== existingIndex.checksum;
  } catch {
    return true;
  }
}

/** Write bookmarks in paginated format (slugs already embedded) */
async function writePaginatedBookmarks(
  bookmarks: UnifiedBookmark[],
): Promise<import("@/types/bookmark").BookmarkSlugMapping> {
  const pageSize = BOOKMARKS_PER_PAGE,
    totalPages = Math.ceil(bookmarks.length / pageSize),
    now = Date.now();

  // Bookmarks already have embedded slugs - just create mapping for backward compatibility
  const mapping = generateSlugMapping(bookmarks);

  const index: BookmarksIndex = {
    count: bookmarks.length,
    totalPages,
    pageSize,
    lastModified: new Date().toISOString(),
    lastFetchedAt: now,
    lastAttemptedAt: now,
    checksum: calculateBookmarksChecksum(bookmarks),
    changeDetected: true,
  };
  await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, index);

  // Write pages with bookmarks ensuring they have embedded slugs
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const slice = bookmarks.slice(start, start + pageSize).map((b) => {
      // Ensure each bookmark has its slug embedded
      const entry = mapping.slugs[b.id];
      if (!entry) {
        throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (page ${page})`);
      }
      return { ...b, slug: entry.slug };
    });
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`, slice);
  }
  console.log(`${LOG_PREFIX} Wrote ${totalPages} pages of bookmarks with embedded slugs`);

  // Save slug mapping for backward compatibility and static generation
  try {
    await saveSlugMapping(bookmarks, true, false);
    console.log(`${LOG_PREFIX} Saved slug mapping for ${bookmarks.length} bookmarks`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Warning: Failed to save slug mapping (bookmarks have embedded slugs):`, error);
    // Not critical since bookmarks have embedded slugs
  }

  return mapping;
}

/** Persist pre-computed tag-filtered bookmarks to S3 storage in paginated format with embedded slugs */
async function persistTagFilteredBookmarksToS3(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (!ENABLE_TAG_PERSISTENCE) {
    envLogger.log("Tag persistence disabled by environment variable", undefined, { category: LOG_PREFIX });
    return;
  }
  // Build a mapping once for this write to embed slugs
  const mapping = generateSlugMapping(bookmarks);
  const pageSize = BOOKMARKS_PER_PAGE,
    bookmarksByTag: Record<string, UnifiedBookmark[]> = {},
    tagCounts: Record<string, number> = {};
  for (const bookmark of bookmarks) {
    const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    for (const tag of tags) {
      const tagName = typeof tag === "string" ? tag : (tag as { name: string }).name;
      const tagSlugValue = tagToSlug(tagName);
      if (!bookmarksByTag[tagSlugValue]) {
        bookmarksByTag[tagSlugValue] = [];
        tagCounts[tagSlugValue] = 0;
      }
      bookmarksByTag[tagSlugValue].push(bookmark);
      tagCounts[tagSlugValue] = (tagCounts[tagSlugValue] || 0) + 1;
    }
  }
  // Apply MAX_TAGS_TO_PERSIST limit if configured with O(n) fast-path when limit >= totalTags
  const allTags = Object.keys(bookmarksByTag);
  const tagsToProcess =
    MAX_TAGS_TO_PERSIST > 0 && MAX_TAGS_TO_PERSIST < allTags.length
      ? Object.entries(tagCounts)
          .sort((a, b) => {
            // Primary sort by count (descending)
            const countDiff = b[1] - a[1];
            if (countDiff !== 0) return countDiff;
            // Secondary sort by tag name (ascending) for deterministic ordering
            return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
          })
          .slice(0, MAX_TAGS_TO_PERSIST)
          .map(([tag]) => tag)
      : allTags;
  
  envLogger.log(
    `Persisting ${tagsToProcess.length} of ${allTags.length} tags to S3 storage`, 
    { totalTags: allTags.length, persistingCount: tagsToProcess.length, limit: MAX_TAGS_TO_PERSIST },
    { category: LOG_PREFIX }
  );
  for (const tagSlug of tagsToProcess) {
    const tagBookmarks = bookmarksByTag[tagSlug];
    if (!tagBookmarks) continue;
    const totalPages = Math.ceil(tagBookmarks.length / pageSize),
      now = Date.now();
    const tagIndex: BookmarksIndex = {
      count: tagBookmarks.length,
      totalPages,
      pageSize,
      lastModified: new Date().toISOString(),
      lastFetchedAt: now,
      lastAttemptedAt: now,
      checksum: calculateBookmarksChecksum(tagBookmarks),
      changeDetected: true,
    };
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`, tagIndex);
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      const slice = tagBookmarks.slice(start, start + pageSize).map((b) => {
        const entry = mapping.slugs[b.id];
        if (!entry) {
          throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (tag=${tagSlug})`);
        }
        return { ...b, slug: entry.slug };
      });
      await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${page}.json`, slice);
    }
  }
  envLogger.log(
    `Persisted tag-filtered bookmarks to S3`,
    { tagCount: tagsToProcess.length, totalTags: allTags.length },
    { category: LOG_PREFIX }
  );
  // Reduce staleness window by clearing in-memory dataset cache after writes
  fullDatasetMemoryCache = null;
}

/** Core refresh logic - only process new/changed bookmarks */
async function selectiveRefreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (!refreshBookmarksCallback) {
    console.error(`${LOG_PREFIX} Refresh callback not set.`);
    return null;
  }
  try {
    const allIncomingBookmarks = await refreshBookmarksCallback();
    if (!allIncomingBookmarks) return null;
    const hasChanged = await hasBookmarksChanged(allIncomingBookmarks);
    if (!hasChanged) {
      console.log(`${LOG_PREFIX} No changes detected, skipping write`);
      // Still update index freshness to reflect successful refresh
      const now = Date.now();
      const existingIndex = (await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX)) || null;
      const updatedIndex: BookmarksIndex = {
        count: existingIndex?.count ?? allIncomingBookmarks.length,
        totalPages: existingIndex?.totalPages ?? Math.ceil(allIncomingBookmarks.length / BOOKMARKS_PER_PAGE),
        pageSize: existingIndex?.pageSize ?? BOOKMARKS_PER_PAGE,
        lastModified: existingIndex?.lastModified ?? new Date().toISOString(),
        lastFetchedAt: now,
        lastAttemptedAt: now,
        checksum: existingIndex?.checksum ?? calculateBookmarksChecksum(allIncomingBookmarks),
        changeDetected: false,
      };
      await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, updatedIndex);
      // Ensure slug mapping exists even when no changes detected (idempotent)
      try {
        await saveSlugMapping(allIncomingBookmarks, true, false);
        console.log(`${LOG_PREFIX} Saved slug mapping (no-change path) for ${allIncomingBookmarks.length} bookmarks`);
      } catch (error) {
        console.error(`${LOG_PREFIX} CRITICAL: Failed to save slug mapping (no-change path):`, error);
        // Slug mappings are CRITICAL for bookmark navigation
        throw new Error(`Failed to save slug mapping: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Ensure bookmarks file exists with full content data
      const mapping = generateSlugMapping(allIncomingBookmarks);
      const bookmarksWithSlugs = allIncomingBookmarks.map((b) => {
        const entry = mapping.slugs[b.id];
        if (!entry) {
          throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (no-change FILE)`);
        }
        return { ...b, slug: entry.slug };
      });
      await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);

      // --- START LOCAL CACHE WRITE ---
      try {
        await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
        await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
        console.log(`${LOG_PREFIX} ✅ Successfully saved bookmarks to local fallback path (no-change path)`);
      } catch (error) {
        console.error(`${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path (no-change path):`, error);
      }
      // --- END LOCAL CACHE WRITE ---

      return allIncomingBookmarks;
    }
    console.log(`${LOG_PREFIX} Changes detected, persisting bookmarks`);
    const mapping = await writePaginatedBookmarks(allIncomingBookmarks);
    {
      const bookmarksWithSlugs = allIncomingBookmarks.map((b) => {
        const entry = mapping.slugs[b.id];
        if (!entry) {
          throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (change FILE)`);
        }
        return { ...b, slug: entry.slug };
      });
      await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);

      // --- START LOCAL CACHE WRITE ---
      try {
        await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
        await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
        console.log(`${LOG_PREFIX} ✅ Successfully saved bookmarks to local fallback path (change-detected path)`);
      } catch (error) {
        console.error(`${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path (change-detected path):`, error);
      }
      // --- END LOCAL CACHE WRITE ---
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
              console.log(`${LOG_PREFIX} ${force ? "Forcing write" : "Changes detected"}, writing to S3`);
              const mapping = await writePaginatedBookmarks(freshBookmarks);
              {
                const bookmarksWithSlugs = freshBookmarks.map((b) => {
                  const entry = mapping.slugs[b.id];
                  if (!entry) {
                    throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (force FILE)`);
                  }
                  return { ...b, slug: entry.slug };
                });
                await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);
              }
              await persistTagFilteredBookmarksToS3(freshBookmarks);
            } else {
              console.log(`${LOG_PREFIX} No changes, skipping heavy S3 writes`);
              // Still update index freshness to reflect successful refresh
              const now = Date.now();
              const existingIndex = (await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX)) || null;
              const updatedIndex: BookmarksIndex = {
                count: existingIndex?.count ?? freshBookmarks.length,
                totalPages: existingIndex?.totalPages ?? Math.ceil(freshBookmarks.length / BOOKMARKS_PER_PAGE),
                pageSize: existingIndex?.pageSize ?? BOOKMARKS_PER_PAGE,
                lastModified: existingIndex?.lastModified ?? new Date().toISOString(),
                lastFetchedAt: now,
                lastAttemptedAt: now,
                checksum: existingIndex?.checksum ?? calculateBookmarksChecksum(freshBookmarks),
                changeDetected: false,
              };
              await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, updatedIndex);
              // Ensure slug mapping exists even when no changes detected (idempotent)
              try {
                await saveSlugMapping(freshBookmarks, true, false);
                console.log(`${LOG_PREFIX} Saved slug mapping (no-change path) for ${freshBookmarks.length} bookmarks`);
              } catch (error) {
                console.error(`${LOG_PREFIX} CRITICAL: Failed to save slug mapping (no-change path):`, error);
                // Slug mappings are CRITICAL for bookmark navigation
                throw new Error(
                  `Failed to save slug mapping: ${error instanceof Error ? error.message : String(error)}`,
                );
              }

              // Generate mapping for use in bookmarks (but don't save it again)
              const mapping = generateSlugMapping(freshBookmarks);
              const bookmarksWithSlugs = freshBookmarks.map((b) => {
                const entry = mapping.slugs[b.id];
                if (!entry) {
                  throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (non-selective FILE)`);
                }
                return { ...b, slug: entry.slug };
              });
              await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);

              // --- START LOCAL CACHE WRITE ---
              try {
                await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
                await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
                console.log(`${LOG_PREFIX} ✅ Successfully saved bookmarks to local fallback path: ${LOCAL_BOOKMARKS_PATH}`);
              } catch (error) {
                console.error(`${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path:`, error);
              }
              // --- END LOCAL CACHE WRITE ---
            }
            // Heartbeat write (tiny file)
            void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
              runAt: Date.now(),
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
          const existingBookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
          if (existingBookmarks && Array.isArray(existingBookmarks) && existingBookmarks.length > 0) {
            console.log(`${LOG_PREFIX} Returning ${existingBookmarks.length} existing bookmarks from S3`);
            // Write heartbeat to record successful fallback
            void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
              runAt: Date.now(),
              success: true,
              changeDetected: false,
              usedFallback: true,
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
        runAt: Date.now(),
        success: !!sel,
        changeDetected: !!sel, // conservative signal
      }).catch(() => void 0);
      return sel;
    } catch (error: unknown) {
      console.error(`${LOG_PREFIX} Failed to refresh bookmarks:`, String(error));
      // Failure heartbeat
      void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
        runAt: Date.now(),
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

/**
 * Fetches bookmarks with Next.js caching layer.
 * Cache duration: 1 hour (coordinated with 2-hour scheduler to minimize staleness).
 * Max staleness: ~3 hours (1h cache + 2h schedule + 15min jitter).
 * @param options - Control data inclusion and fetch behavior
 * @returns Full or lightweight bookmarks depending on options
 */
async function fetchAndCacheBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  "use cache";
  // Cache for 1 hour to coordinate with 2-hour scheduler runs.
  // This ensures data refreshes between scheduler cycles.
  safeCacheLife({ revalidate: 3600 }); // 1 hour
  safeCacheTag("bookmarks-s3-full");
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  envLogger.service(
    "BookmarksDataAccess",
    "fetchAndCacheBookmarks",
    { skipExternalFetch, includeImageData, force },
  );

  // Define normalizeBookmarkTags function before usage
  const normalizeBookmarkTags = (bookmark: UnifiedBookmark) => ({
    ...bookmark,
    tags: (bookmark.tags || [])
      .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
      .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
  });

  // --- 1. Prefer S3 in production runtime; use local fallback only in dev/test/CLI contexts ---
  const isProductionRuntime = getEnvironment() === "production" && !isCliLikeContext();
  if (!isProductionRuntime) {
    try {
      const localData = await fs.readFile(LOCAL_BOOKMARKS_PATH, "utf-8");
      const bookmarks = JSON.parse(localData) as UnifiedBookmark[];

      // Skip local cache if it only contains test data
      const isTestData =
        bookmarks.length === 1 &&
        (bookmarks[0]?.id === "test-1" || bookmarks[0]?.id === "test" || bookmarks[0]?.url === "https://example.com");
      if (isTestData) {
        console.log(`${LOG_PREFIX} Local cache contains only test data, skipping to S3`);
      } else if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
        console.log(
          `${LOG_PREFIX} Successfully loaded ${bookmarks.length} bookmarks from local cache: ${LOCAL_BOOKMARKS_PATH}`,
        );
        if (!includeImageData) {
          console.log(`${LOG_PREFIX} Stripping image data from ${bookmarks.length} bookmarks`);
          return bookmarks.map(stripImageData);
        }
        return bookmarks.map(normalizeBookmarkTags);
      }
    } catch (error) {
      console.warn(
        `[Bookmarks] Local bookmarks cache not found or invalid, proceeding to S3. Error: ${String(error)}`,
      );
    }
  } else {
    // Explicitly log that we are skipping local fallback in production runtime to avoid stale snapshots from build layers
    envLogger.log("Skipping local bookmarks fallback in production runtime; using S3-first strategy", undefined, {
      category: LOG_PREFIX,
    });
  }

  // --- 2. Fallback to S3 ---
  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
      console.log(`${LOG_PREFIX} Loaded ${bookmarks.length} bookmarks from S3`);
      if (process.env.DEBUG_BOOKMARKS === "true") {
        const cliBookmark = bookmarks.find((b) => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
        if (cliBookmark) {
          console.log(`[BookmarksServer] CLI bookmark content exists:`, {
            hasContent: !!cliBookmark.content,
            hasScreenshotAssetId: !!cliBookmark.content?.screenshotAssetId,
            screenshotAssetId: cliBookmark.content?.screenshotAssetId,
            contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
          });
        }
      }
      if (!includeImageData) {
        console.log(`${LOG_PREFIX} Stripping image data from ${bookmarks.length} bookmarks`);
        return bookmarks.map(stripImageData);
      }
      return bookmarks.map(normalizeBookmarkTags);
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404)
      console.error(`${LOG_PREFIX} Error reading bookmarks file:`, String(e));
  }
  console.log(`${LOG_PREFIX} No bookmarks in S3, trying refresh`);
  if (skipExternalFetch) return [];
  const refreshedBookmarks = await refreshAndPersistBookmarks(force);
  if (!refreshedBookmarks) return [];
  if (!includeImageData) {
    console.log(`${LOG_PREFIX} Stripping image data from refreshed bookmarks`);
    return refreshedBookmarks.map(stripImageData);
  }
  return refreshedBookmarks.map(normalizeBookmarkTags);
}

async function getBookmarksPageDirect(pageNumber: number): Promise<UnifiedBookmark[]> {
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`);
    return pageData ? normalizePageBookmarkTags(pageData) : [];
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) return [];
    console.error(`${LOG_PREFIX} S3 service error loading page ${pageNumber}:`, error);
    return [];
  }
}

/**
 * Gets a paginated bookmarks page with caching.
 * Cache duration: 1 day (pages rarely change, reduces S3 reads).
 * @param pageNumber - Page number to fetch (1-indexed)
 * @returns Bookmarks for the specified page
 */
async function getCachedBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 86400 }); // 1 day - pagination rarely changes
  safeCacheTag("bookmarks", `bookmarks-page-${pageNumber}`);
  return getBookmarksPageDirect(pageNumber);
}

export async function getBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedBookmarksPage(pageNumber),
        () => getBookmarksPageDirect(pageNumber),
      )
    : getBookmarksPageDirect(pageNumber);
}

async function getTagBookmarksPageDirect(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(
      `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`,
    );
    return pageData ? normalizePageBookmarkTags(pageData) : [];
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) return [];
    console.error(`${LOG_PREFIX} S3 service error loading tag page ${tagSlug}/${pageNumber}:`, error);
    return [];
  }
}

/**
 * Gets bookmarks for a specific tag with caching.
 * Cache duration: 1 hour (aligned with main cache for consistency).
 * @param tagSlug - URL-safe tag identifier
 * @param pageNumber - Page number within tag results
 * @returns Bookmarks matching the tag
 */
async function getCachedTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - aligned with main bookmark cache
  safeCacheTag("bookmarks", `bookmarks-tag-${tagSlug}`, `bookmarks-tag-${tagSlug}-page-${pageNumber}`);
  return getTagBookmarksPageDirect(tagSlug, pageNumber);
}

export async function getTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  return USE_NEXTJS_CACHE
    ? withCacheFallback(
        () => getCachedTagBookmarksPage(tagSlug, pageNumber),
        () => getTagBookmarksPageDirect(tagSlug, pageNumber),
      )
    : getTagBookmarksPageDirect(tagSlug, pageNumber);
}

async function getTagBookmarksIndexDirect(tagSlug: string): Promise<BookmarksIndex | null> {
  try {
    return await readJsonS3<BookmarksIndex>(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`);
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) return null;
    console.error(`${LOG_PREFIX} S3 service error loading tag index ${tagSlug}:`, error);
    return null;
  }
}

/**
 * Gets tag-specific bookmarks index with caching.
 * Cache duration: 1 hour (matches tag pages for consistency).
 * @param tagSlug - URL-safe tag identifier
 * @returns Index metadata for tag bookmarks
 */
async function getCachedTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - consistent with tag pages
  safeCacheTag("bookmarks", `bookmarks-tag-${tagSlug}`, `bookmarks-tag-${tagSlug}-index`);
  return getTagBookmarksIndexDirect(tagSlug);
}

export async function getTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  if (USE_NEXTJS_CACHE) {
    try {
      const cached = await getCachedTagBookmarksIndex(tagSlug);
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    return getTagBookmarksIndexDirect(tagSlug);
  }
  return getTagBookmarksIndexDirect(tagSlug);
}

async function getBookmarksIndexDirect(): Promise<BookmarksIndex | null> {
  try {
    const rawIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
    const validation = BookmarksIndexSchema.safeParse(rawIndex);
    if (validation.success) return validation.data;
    console.warn(`${LOG_PREFIX} Main bookmarks index failed validation`, validation.error);
    return null;
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) return null;
    console.error(`${LOG_PREFIX} S3 service error loading main bookmarks index:`, error);
    return null;
  }
}

/**
 * Gets main bookmarks index with caching.
 * Cache duration: 1 hour (coordinates with scheduler for fresh counts).
 * @returns Index with count, pages, checksum, and freshness timestamps
 */
async function getCachedBookmarksIndex(): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife({ revalidate: 3600 }); // 1 hour - ensures fresh counts between scheduler runs
  safeCacheTag("bookmarks", "bookmarks-index");
  return getBookmarksIndexDirect();
}

export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  if (inFlightGetPromise) return inFlightGetPromise;
  inFlightGetPromise = fetchAndCacheBookmarks(options);
  try {
    return await inFlightGetPromise;
  } catch (e) {
    console.error(`${LOG_PREFIX} Failed to get bookmarks:`, String(e));
    return [];
  } finally {
    inFlightGetPromise = null;
  }
}

/** Get bookmarks by tag with caching support */
export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
): Promise<{ bookmarks: UnifiedBookmark[]; totalCount: number; totalPages: number; fromCache: boolean }> {
  console.log(`${LOG_PREFIX} getBookmarksByTag called with tagSlug: "${tagSlug}", pageNumber: ${pageNumber}`);
  const cachedPage = await getTagBookmarksPage(tagSlug, pageNumber);
  if (cachedPage.length > 0) {
    const index = await getTagBookmarksIndex(tagSlug);
    console.log(`${LOG_PREFIX} Using cached data for tag "${tagSlug}"`);
    return {
      bookmarks: cachedPage,
      totalCount: index?.count || cachedPage.length,
      totalPages: index?.totalPages || 1,
      fromCache: true,
    };
  }
  console.log(`${LOG_PREFIX} Cache miss for tag "${tagSlug}". Falling back to full bookmark set filtering`);
  
  // Check in-memory runtime cache first to avoid repeated S3 reads.
  // In test environment, bypass the in-process cache so each test can
  // provide different mocked datasets deterministically.
  let allBookmarks: UnifiedBookmark[];
  const now = Date.now();
  const bypassMemoryCache = process.env.NODE_ENV === "test";

  if (!bypassMemoryCache && fullDatasetMemoryCache && now - fullDatasetMemoryCache.timestamp < FULL_DATASET_MEMORY_CACHE_TTL) {
    envLogger.log(
      "Using in-memory runtime cache for full bookmarks dataset",
      { age: Math.round((now - fullDatasetMemoryCache.timestamp) / 1000), unit: "seconds" },
      { category: LOG_PREFIX },
    );
    allBookmarks = fullDatasetMemoryCache.data;
  } else {
    envLogger.log("Reading full bookmarks dataset from S3 persistence", undefined, { category: LOG_PREFIX });
    allBookmarks = (await getBookmarks({
      includeImageData: true,
      skipExternalFetch: false,
      force: false,
    } satisfies BookmarkLoadOptions)) as UnifiedBookmark[];

    if (!bypassMemoryCache) {
      // Update in-memory runtime cache
      fullDatasetMemoryCache = {
        data: allBookmarks,
        timestamp: now,
      };
      envLogger.log(
        "Updated in-memory runtime cache",
        { bookmarkCount: allBookmarks.length },
        { category: LOG_PREFIX },
      );
    }
  }
  const filteredBookmarks = allBookmarks.filter((b) => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some((t) => {
      const tagName = typeof t === "string" ? t : (t as { name: string }).name;
      return tagToSlug(tagName) === tagSlug;
    });
  });
  const totalCount = filteredBookmarks.length,
    totalPages = Math.ceil(totalCount / BOOKMARKS_PER_PAGE);
  const start = (pageNumber - 1) * BOOKMARKS_PER_PAGE,
    paginated = filteredBookmarks.slice(start, start + BOOKMARKS_PER_PAGE);
  console.log(`${LOG_PREFIX} Found ${paginated.length} bookmarks for page ${pageNumber} of tag "${tagSlug}"`);
  return { bookmarks: paginated, totalCount, totalPages, fromCache: false };
}

/** Cache invalidation functions (Next.js cache and in-memory runtime cache) */
export const invalidateBookmarksCache = (): void => {
  // Clear in-memory runtime cache
  fullDatasetMemoryCache = null;
  envLogger.log("In-memory runtime cache cleared", undefined, { category: LOG_PREFIX });
  
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("bookmarks");
    safeRevalidateTag("bookmarks-s3-full");
    envLogger.log("Next.js cache invalidated for bookmarks tags", undefined, { category: "Bookmarks" });
  }
};
export const invalidateBookmarksPageCache = (pageNumber: number): void => {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-page-${pageNumber}`);
    console.log(`[Bookmarks] Cache invalidated for page: ${pageNumber}`);
  }
};
export const invalidateBookmarksTagCache = (tagSlug: string): void => {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-tag-${tagSlug}`);
    console.log(`[Bookmarks] Cache invalidated for tag: ${tagSlug}`);
  }
};
export const invalidateTagCache = invalidateBookmarksTagCache;
export const invalidateBookmarkCache = (bookmarkId: string): void => {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmark-${bookmarkId}`);
    console.log(`[Bookmarks] Cache invalidated for bookmark: ${bookmarkId}`);
  }
};

export async function getBookmarksIndex(): Promise<BookmarksIndex | null> {
  if (USE_NEXTJS_CACHE) {
    try {
      const cached = await getCachedBookmarksIndex();
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    return getBookmarksIndexDirect();
  }
  return getBookmarksIndexDirect();
}

// Cleanup cache and locks on process exit
process.on("SIGTERM", () => {
  releaseRefreshLock().catch((error) => console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)));
});
