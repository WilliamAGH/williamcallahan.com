/** Bookmarks data access: In-memory → S3 → External API */

import { readJsonS3, writeJsonS3, listS3Objects, deleteFromS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE, DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
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
import { USE_NEXTJS_CACHE, cacheContextGuards, isCliLikeCacheContext, withCacheFallback } from "@/lib/cache";
import { getDeterministicTimestamp } from "@/lib/server-cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import { processBookmarksInBatches } from "@/lib/bookmarks/enrich-opengraph";

const LOCAL_BOOKMARKS_PATH = path.join(process.cwd(), "lib", "data", "bookmarks.json");
const LOCAL_BOOKMARKS_BY_ID_DIR = path.join(process.cwd(), ".next", "cache", "bookmarks", "by-id");

const forceLocalS3Cache = process.env.FORCE_LOCAL_S3_CACHE === "true";
const nextPhase = process.env.NEXT_PHASE;
// Only disable the local S3 snapshot during the production build step so runtime containers
// can continue serving cached data even when S3/CDN is offline.
const isBuildPhase = nextPhase === "phase-production-build";
const shouldSkipLocalS3Cache = !forceLocalS3Cache && isBuildPhase;

let localS3CacheModule: typeof import("@/lib/bookmarks/local-s3-cache") | null = null;
async function readLocalS3JsonSafe<T>(key: string): Promise<T | null> {
  if (shouldSkipLocalS3Cache) {
    return null;
  }
  if (!localS3CacheModule) {
    localS3CacheModule = await import("@/lib/bookmarks/local-s3-cache");
  }
  return localS3CacheModule.readLocalS3Json<T>(key);
}

// Runtime-safe cache wrappers for experimental Next.js APIs
// These functions are only available in Next.js request context with experimental.useCache enabled
// They will be no-ops when called from CLI scripts or outside request context

const isCliLikeContext = isCliLikeCacheContext;

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
  cacheContextGuards.cacheLife("BookmarksDataAccess", profile);
};

const safeCacheTag = (...tags: string[]): void => {
  cacheContextGuards.cacheTag("BookmarksDataAccess", ...tags);
};

const safeRevalidateTag = (...tags: string[]): void => {
  cacheContextGuards.revalidateTag("BookmarksDataAccess", ...tags);
};

const ENABLE_TAG_PERSISTENCE = process.env.ENABLE_TAG_PERSISTENCE !== "false";

// Default to no limit (persist all tags) when env var not set or invalid
const RAW_MAX_TAGS = process.env.MAX_TAGS_TO_PERSIST;
const PARSED_MAX_TAGS = RAW_MAX_TAGS != null ? Number(RAW_MAX_TAGS) : Number.NaN;
const MAX_TAGS_TO_PERSIST =
  Number.isFinite(PARSED_MAX_TAGS) && PARSED_MAX_TAGS > 0 ? Math.floor(PARSED_MAX_TAGS) : Number.MAX_SAFE_INTEGER;

if (RAW_MAX_TAGS && (!Number.isFinite(PARSED_MAX_TAGS) || PARSED_MAX_TAGS <= 0)) {
  envLogger.debug(
    "MAX_TAGS_TO_PERSIST is invalid or <= 0; defaulting to unlimited persistence",
    { RAW_MAX_TAGS },
    { category: "BookmarksDataAccess" },
  );
}

async function saveSlugMappingOrThrow(bookmarks: UnifiedBookmark[], logSuffix: string): Promise<void> {
  try {
    await saveSlugMapping(bookmarks, true, false);
    logBookmarkDataAccessEvent("Saved slug mapping", { context: logSuffix, bookmarkCount: bookmarks.length });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error(`${LOG_PREFIX} CRITICAL: Failed to save slug mapping ${logSuffix}:`, normalizedError);
    throw new Error(`Failed to save slug mapping: ${normalizedError.message}`, { cause: error });
  }
}

// In-memory runtime cache for the full bookmarks dataset to prevent repeated S3 reads
// This is a temporary runtime cache, NOT S3 persistence
const FULL_DATASET_MEMORY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let fullDatasetMemoryCache: { data: UnifiedBookmark[]; timestamp: number } | null = null;

const BOOKMARK_BY_ID_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const BOOKMARK_BY_ID_CACHE_LIMIT = 1024;
const bookmarkByIdCache = new Map<string, { data: UnifiedBookmark; timestamp: number }>();
const lightweightBookmarkByIdCache = new Map<string, { data: LightweightBookmark; timestamp: number }>();

function invalidateBookmarkByIdCaches(): void {
  bookmarkByIdCache.clear();
  lightweightBookmarkByIdCache.clear();
}

function getCachedBookmark<T>(cache: Map<string, { data: T; timestamp: number }>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (getDeterministicTimestamp() - entry.timestamp > BOOKMARK_BY_ID_CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCachedBookmark<T>(cache: Map<string, { data: T; timestamp: number }>, key: string, value: T): void {
  cache.set(key, { data: value, timestamp: getDeterministicTimestamp() });
  if (cache.size > BOOKMARK_BY_ID_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

// In-process short-TTL cache parameters (centralized in lib/cache; local cache removed)

const LOG_PREFIX = "[BookmarksDataAccess]";
const BOOKMARK_SERVICE_LOG_CATEGORY = "BookmarksDataAccess";
const isBookmarkServiceLoggingEnabled =
  process.env.DEBUG_BOOKMARKS === "true" ||
  process.env.DEBUG_BOOKMARKS_SERVICE === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

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
  Number.isFinite(PARSED_LOCK_TTL) && PARSED_LOCK_TTL > 0 ? Math.floor(PARSED_LOCK_TTL) : DEFAULT_LOCK_TTL_MS;

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
let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

const isS3Error = (err: unknown): err is { $metadata?: { httpStatusCode?: number } } =>
  typeof err === "object" && err !== null && "$metadata" in err;

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
    maxItems: 50,
  });
  const afterSig = computeDisplaySignature(updated);
  return { changed: beforeSig !== afterSig, updated };
}

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
      .catch(error => console.error("[Bookmarks] Failed to initialize refresh callback:", String(error)));
  }
  if (!lockCleanupInterval) {
    if (!isRefreshLocked) {
      cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch(error =>
        envLogger.debug("Initial lock cleanup failed", { error: String(error) }, { category: "BookmarksLock" }),
      );
    }
    lockCleanupInterval = setInterval(() => {
      if (isRefreshLocked) {
        envLogger.debug("Skipping stale lock cleanup while current process holds the distributed lock", undefined, {
          category: "BookmarksLock",
        });
        return;
      }
      cleanupStaleLocks(DISTRIBUTED_LOCK_S3_KEY, "BookmarksLock").catch(error =>
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
    releaseRefreshLock().catch(error => console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)));
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
    now = getDeterministicTimestamp();

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
    const slice = bookmarks.slice(start, start + pageSize).map(b => {
      // Ensure each bookmark has its slug embedded
      const entry = mapping.slugs[b.id];
      if (!entry) {
        throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (page ${page})`);
      }
      return { ...b, slug: entry.slug };
    });
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`, slice);
  }
  logBookmarkDataAccessEvent("Wrote bookmarks pages with embedded slugs", { totalPages });

  // Save slug mapping for backward compatibility and static generation
  try {
    await saveSlugMapping(bookmarks, true, false);
    logBookmarkDataAccessEvent("Saved slug mapping after writing pages", { bookmarkCount: bookmarks.length });
  } catch (error) {
    console.error(`${LOG_PREFIX} Warning: Failed to save slug mapping (bookmarks have embedded slugs):`, error);
    // Not critical since bookmarks have embedded slugs
  }

  return mapping;
}

async function writeBookmarksByIdFiles(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (bookmarks.length === 0) return;
  const batchSize = 25;
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    const batch = bookmarks.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async bookmark => {
        if (!bookmark.slug) {
          throw new Error(`${LOG_PREFIX} Missing slug while writing by-id file for bookmark id=${bookmark.id}`);
        }
        await writeJsonS3(`${BOOKMARKS_S3_PATHS.BY_ID_DIR}/${bookmark.id}.json`, bookmark);

        try {
          await fs.mkdir(LOCAL_BOOKMARKS_BY_ID_DIR, { recursive: true });
          await fs.writeFile(path.join(LOCAL_BOOKMARKS_BY_ID_DIR, `${bookmark.id}.json`), JSON.stringify(bookmark));
        } catch (error) {
          envLogger.debug(
            "Failed to cache bookmark locally by id",
            { bookmarkId: bookmark.id, error: String(error) },
            { category: LOG_PREFIX },
          );
        }
      }),
    );
  }
}

async function cleanupLocalBookmarkByIdFiles(activeIds: ReadonlySet<string>): Promise<number> {
  try {
    const entries = await fs.readdir(LOCAL_BOOKMARKS_BY_ID_DIR, { withFileTypes: true });
    const removals = await Promise.all(
      entries.map(async entry => {
        if (!entry.isFile() || !entry.name.endsWith(".json")) {
          return 0;
        }
        const bookmarkId = entry.name.replace(/\.json$/, "");
        if (activeIds.has(bookmarkId)) {
          return 0;
        }
        try {
          await fs.rm(path.join(LOCAL_BOOKMARKS_BY_ID_DIR, entry.name), { force: true });
          return 1;
        } catch (error) {
          envLogger.debug(
            "Failed to delete local bookmark by-id cache file",
            { bookmarkId, error: String(error) },
            { category: LOG_PREFIX },
          );
          return 0;
        }
      }),
    );
    return removals.reduce<number>((sum, count) => sum + count, 0);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return 0;
    }
    envLogger.debug(
      "Failed to scan local bookmark by-id cache for cleanup",
      { error: String(error) },
      { category: LOG_PREFIX },
    );
    return 0;
  }
}

async function cleanupS3BookmarkByIdFiles(activeIds: ReadonlySet<string>): Promise<number> {
  const prefix = `${BOOKMARKS_S3_PATHS.BY_ID_DIR}/`;
  const keys = await listS3Objects(prefix);
  if (keys.length === 0) {
    return 0;
  }

  const removals = await Promise.all(
    keys.map(async key => {
      if (!key.endsWith(".json")) {
        return 0;
      }
      const normalizedKey = key.startsWith(prefix) ? key.slice(prefix.length) : key;
      const bookmarkId = normalizedKey.replace(/\.json$/, "");
      if (activeIds.has(bookmarkId)) {
        return 0;
      }
      try {
        await deleteFromS3(key);
        return 1;
      } catch (error) {
        envLogger.debug(
          "Failed to delete orphaned bookmark by-id object in S3",
          { bookmarkId, key, error: String(error) },
          { category: LOG_PREFIX },
        );
        return 0;
      }
    }),
  );

  return removals.reduce<number>((sum, count) => sum + count, 0);
}

async function cleanupOrphanedBookmarkByIdFiles(bookmarks: UnifiedBookmark[]): Promise<void> {
  const activeIds = new Set(bookmarks.map(bookmark => bookmark.id));
  const [localDeleted, remoteDeleted] = await Promise.all([
    cleanupLocalBookmarkByIdFiles(activeIds),
    cleanupS3BookmarkByIdFiles(activeIds),
  ]);

  if (localDeleted > 0 || remoteDeleted > 0) {
    logBookmarkDataAccessEvent("Removed orphaned bookmark by-id cache entries", {
      localDeleted,
      remoteDeleted,
    });
  }
}

async function writeBookmarkMasterFiles(bookmarksWithSlugs: UnifiedBookmark[]): Promise<void> {
  invalidateBookmarkByIdCaches();
  await cleanupOrphanedBookmarkByIdFiles(bookmarksWithSlugs);
  await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);
  await writeBookmarksByIdFiles(bookmarksWithSlugs);
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
          .toSorted((a, b) => {
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
    { category: LOG_PREFIX },
  );
  for (const tagSlug of tagsToProcess) {
    const tagBookmarks = bookmarksByTag[tagSlug];
    if (!tagBookmarks) continue;
    const totalPages = Math.ceil(tagBookmarks.length / pageSize),
      now = getDeterministicTimestamp();
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
      const slice = tagBookmarks.slice(start, start + pageSize).map(b => {
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
    { category: LOG_PREFIX },
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
      logBookmarkDataAccessEvent("No changes detected, skipping bookmarks write");

      const now = getDeterministicTimestamp();
      const existingIndex = (await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX)) || null;
      const baseIndex: Omit<BookmarksIndex, "changeDetected"> = {
        count: existingIndex?.count ?? allIncomingBookmarks.length,
        totalPages: existingIndex?.totalPages ?? Math.ceil(allIncomingBookmarks.length / BOOKMARKS_PER_PAGE),
        pageSize: existingIndex?.pageSize ?? BOOKMARKS_PER_PAGE,
        lastModified: existingIndex?.lastModified ?? new Date().toISOString(),
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
        console.warn(`${LOG_PREFIX} Metadata-only refresh failed, continuing with existing dataset:`, String(err));
      }

      if (!metadataChanged) {
        await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, { ...baseIndex, changeDetected: false });
        return allIncomingBookmarks;
      }

      const mapping = generateSlugMapping(refreshed);
      const bookmarksWithSlugs = refreshed.map(b => {
        const entry = mapping.slugs[b.id];
        if (!entry) {
          throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (metadata refresh)`);
        }
        return { ...b, slug: entry.slug };
      });

      await writeBookmarkMasterFiles(bookmarksWithSlugs);
      await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, {
        ...baseIndex,
        lastModified: new Date().toISOString(),
        checksum: calculateBookmarksChecksum(bookmarksWithSlugs),
        changeDetected: true,
      });

      // --- START LOCAL CACHE WRITE ---
      try {
        await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
        await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
        logBookmarkDataAccessEvent("Saved bookmarks to local fallback path (metadata refresh)", {
          path: LOCAL_BOOKMARKS_PATH,
          bookmarkCount: bookmarksWithSlugs.length,
        });
      } catch (error) {
        console.error(`${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path (metadata refresh):`, error);
      }
      // --- END LOCAL CACHE WRITE ---

      return bookmarksWithSlugs;
    }
    logBookmarkDataAccessEvent("Changes detected, persisting bookmarks");
    const mapping = await writePaginatedBookmarks(allIncomingBookmarks);
    {
      const bookmarksWithSlugs = allIncomingBookmarks.map(b => {
        const entry = mapping.slugs[b.id];
        if (!entry) {
          throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (change FILE)`);
        }
        return { ...b, slug: entry.slug };
      });
      await writeBookmarkMasterFiles(bookmarksWithSlugs);

      // --- START LOCAL CACHE WRITE ---
      try {
        await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
        await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
        logBookmarkDataAccessEvent("Saved bookmarks to local fallback path (change-detected path)", {
          path: LOCAL_BOOKMARKS_PATH,
          bookmarkCount: bookmarksWithSlugs.length,
        });
      } catch (error) {
        console.error(
          `${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path (change-detected path):`,
          error,
        );
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
              logBookmarkDataAccessEvent(force ? "Forcing S3 write" : "Changes detected, writing to S3");
              const mapping = await writePaginatedBookmarks(freshBookmarks);
              {
                const bookmarksWithSlugs = freshBookmarks.map(b => {
                  const entry = mapping.slugs[b.id];
                  if (!entry) {
                    throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (force FILE)`);
                  }
                  return { ...b, slug: entry.slug };
                });
                await writeBookmarkMasterFiles(bookmarksWithSlugs);
              }
              await persistTagFilteredBookmarksToS3(freshBookmarks);
            } else {
              logBookmarkDataAccessEvent("No changes detected, skipping heavy S3 writes");
              // Still update index freshness to reflect successful refresh
              const now = getDeterministicTimestamp();
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
              await saveSlugMappingOrThrow(freshBookmarks, "no-change path");

              // Attempt metadata-only refresh (captures OG/title/description changes)
              let metadataChanged = false;
              let refreshed = freshBookmarks;
              try {
                const res = await refreshMetadataIfNeeded(freshBookmarks);
                metadataChanged = res.changed;
                refreshed = res.updated;
              } catch (err) {
                console.warn(`${LOG_PREFIX} Metadata-only refresh failed (default path):`, String(err));
              }

              // Generate mapping and write FILE (always), and optionally rewrite pages/tags if metadata changed
              const mapping = generateSlugMapping(refreshed);
              const bookmarksWithSlugs = refreshed.map(b => {
                const entry = mapping.slugs[b.id];
                if (!entry) {
                  throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (non-selective FILE)`);
                }
                return { ...b, slug: entry.slug };
              });
              await writeBookmarkMasterFiles(bookmarksWithSlugs);
              if (metadataChanged) {
                logBookmarkDataAccessEvent(
                  "Metadata-only changes detected; master FILE updated (pages/tags refresh deferred)",
                );
                // NOTE: Removed aggressive full rewrite to prevent S3 write storms
                // Pages/tags will be refreshed on next actual dataset change (max 2 hours)
                // This prevents 120+ S3 writes when only metadata changed
              }

              // --- START LOCAL CACHE WRITE ---
              try {
                await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
                await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarksWithSlugs, null, 2));
                logBookmarkDataAccessEvent("Saved bookmarks to local fallback path", {
                  path: LOCAL_BOOKMARKS_PATH,
                  bookmarkCount: bookmarksWithSlugs.length,
                });
              } catch (error) {
                console.error(`${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path:`, error);
              }
              // --- END LOCAL CACHE WRITE ---
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
          const existingBookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
          if (existingBookmarks && Array.isArray(existingBookmarks) && existingBookmarks.length > 0) {
            logBookmarkDataAccessEvent("Returning existing bookmarks from S3 fallback", {
              bookmarkCount: existingBookmarks.length,
            });
            // Write heartbeat to record successful fallback
            void writeJsonS3(BOOKMARKS_S3_PATHS.HEARTBEAT, {
              runAt: getDeterministicTimestamp(),
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
  logBookmarkDataAccessEvent("fetchAndCacheBookmarks", { skipExternalFetch, includeImageData, force });

  // Define normalizeBookmarkTags function before usage
  const normalizeBookmarkTags = (bookmark: UnifiedBookmark) => ({
    ...bookmark,
    tags: (bookmark.tags || [])
      .filter(tag => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
      .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
  });

  // --- 1. Prefer S3 in production runtime; use local fallback only in dev/test/CLI contexts ---
  const isProductionRuntime =
    getEnvironment() === "production" && !isCliLikeContext() && process.env.NEXT_PHASE !== "phase-production-build";
  const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined;
  if (!isProductionRuntime && !isTestEnvironment) {
    try {
      const localData = await fs.readFile(LOCAL_BOOKMARKS_PATH, "utf-8");
      const bookmarks = JSON.parse(localData) as UnifiedBookmark[];

      // Skip local cache if it only contains test data
      const isTestData =
        bookmarks.length === 1 &&
        (bookmarks[0]?.id === "test-1" || bookmarks[0]?.id === "test" || bookmarks[0]?.url === "https://example.com");
      if (isTestData) {
        logBookmarkDataAccessEvent("Local cache contains only test data; skipping to S3");
      } else if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
        logBookmarkDataAccessEvent("Loaded bookmarks from local cache", {
          bookmarkCount: bookmarks.length,
          path: LOCAL_BOOKMARKS_PATH,
        });
        if (!includeImageData) {
          logBookmarkDataAccessEvent("Stripping image data from local cache bookmarks", {
            bookmarkCount: bookmarks.length,
          });
          return bookmarks.map(stripImageData);
        }
        return bookmarks.map(normalizeBookmarkTags);
      }
    } catch (error) {
      console.warn(`[Bookmarks] Local bookmarks cache not found or invalid, proceeding to S3. Error: ${String(error)}`);
    }
  } else if (isProductionRuntime) {
    // Explicitly log that we are skipping local fallback in production runtime to avoid stale snapshots from build layers
    envLogger.log("Skipping local bookmarks fallback in production runtime; using S3-first strategy", undefined, {
      category: LOG_PREFIX,
    });
  }

  // --- 2. Fallback to S3 (with local snapshot) ---
  const formatBookmarks = (dataset: UnifiedBookmark[], source: string) => {
    if (!includeImageData) {
      logBookmarkDataAccessEvent(`Stripping image data from ${source} bookmarks`, {
        bookmarkCount: dataset.length,
      });
      return dataset.map(stripImageData);
    }
    return dataset.map(normalizeBookmarkTags);
  };

  let bookmarksFromS3: UnifiedBookmark[] | null = null;
  try {
    const s3Data = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (s3Data && Array.isArray(s3Data) && s3Data.length > 0) {
      bookmarksFromS3 = s3Data;
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404) {
      console.error(`${LOG_PREFIX} Error reading bookmarks file:`, String(e));
    }
  }

  if (bookmarksFromS3) {
    logBookmarkDataAccessEvent("Loaded bookmarks from S3", { bookmarkCount: bookmarksFromS3.length });
    if (process.env.DEBUG_BOOKMARKS === "true") {
      const cliBookmark = bookmarksFromS3.find(b => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
      if (cliBookmark) {
        logBookmarkDataAccessEvent("CLI bookmark content exists", {
          hasContent: !!cliBookmark.content,
          hasScreenshotAssetId: !!cliBookmark.content?.screenshotAssetId,
          screenshotAssetId: cliBookmark.content?.screenshotAssetId,
          contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
        });
      }
    }
    return formatBookmarks(bookmarksFromS3, "S3");
  }

  const localS3Snapshot = await readLocalS3JsonSafe<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
  if (localS3Snapshot && Array.isArray(localS3Snapshot) && localS3Snapshot.length > 0) {
    logBookmarkDataAccessEvent("Loaded bookmarks from local S3 snapshot", {
      bookmarkCount: localS3Snapshot.length,
      source: "local",
    });
    return formatBookmarks(localS3Snapshot, "local S3 snapshot");
  }

  logBookmarkDataAccessEvent("No bookmarks in S3; attempting refresh");
  if (skipExternalFetch) return [];
  const refreshedBookmarks = await refreshAndPersistBookmarks(force);
  if (!refreshedBookmarks) return [];
  if (!includeImageData) {
    logBookmarkDataAccessEvent("Stripping image data from refreshed bookmarks", {
      bookmarkCount: refreshedBookmarks.length,
    });
    return refreshedBookmarks.map(stripImageData);
  }
  return refreshedBookmarks.map(normalizeBookmarkTags);
}

async function getBookmarksPageDirect(pageNumber: number): Promise<UnifiedBookmark[]> {
  const key = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(key);
    if (pageData) {
      return normalizePageBookmarkTags(pageData);
    }
  } catch (error) {
    if (!isS3Error(error) || error.$metadata?.httpStatusCode !== 404) {
      console.error(`${LOG_PREFIX} S3 service error loading page ${pageNumber}:`, error);
    }
  }

  const fallback = await readLocalS3JsonSafe<UnifiedBookmark[]>(key);
  if (fallback) {
    logBookmarkDataAccessEvent("Loaded page data from local S3 cache", { pageNumber, source: "local" });
    return normalizePageBookmarkTags(fallback);
  }

  return [];
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
  const key = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(key);
    if (pageData) {
      return normalizePageBookmarkTags(pageData);
    }
  } catch (error) {
    if (!isS3Error(error) || error.$metadata?.httpStatusCode !== 404) {
      console.error(`${LOG_PREFIX} S3 service error loading tag page ${tagSlug}/${pageNumber}:`, error);
    }
  }

  const fallback = await readLocalS3JsonSafe<UnifiedBookmark[]>(key);
  if (fallback) {
    logBookmarkDataAccessEvent("Loaded tag page data from local S3 cache", {
      pageNumber,
      tagSlug,
      source: "local",
    });
    return normalizePageBookmarkTags(fallback);
  }

  return [];
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

export async function getBookmarkById(
  bookmarkId: string,
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark | LightweightBookmark | null> {
  const includeImageData = options.includeImageData ?? true;
  const cache = includeImageData ? bookmarkByIdCache : lightweightBookmarkByIdCache;
  const cached = getCachedBookmark(cache, bookmarkId);
  if (cached) {
    return cached;
  }

  const localFilePath = path.join(LOCAL_BOOKMARKS_BY_ID_DIR, `${bookmarkId}.json`);
  let bookmark: UnifiedBookmark | null = null;

  try {
    const localData = await fs.readFile(localFilePath, "utf-8");
    bookmark = JSON.parse(localData) as UnifiedBookmark;
  } catch {
    // Ignore local cache misses
  }

  if (!bookmark) {
    bookmark = await readJsonS3<UnifiedBookmark>(`${BOOKMARKS_S3_PATHS.BY_ID_DIR}/${bookmarkId}.json`);
  }

  if (!bookmark) {
    envLogger.log(
      "Per-bookmark JSON missing in S3. Falling back to scanning full dataset.",
      { bookmarkId },
      { category: LOG_PREFIX },
    );
    const allBookmarks = (await getBookmarks({
      includeImageData: true,
      skipExternalFetch: options.skipExternalFetch ?? DEFAULT_BOOKMARK_OPTIONS.skipExternalFetch,
      force: options.force ?? DEFAULT_BOOKMARK_OPTIONS.force,
    })) as UnifiedBookmark[];
    bookmark = allBookmarks.find(b => b.id === bookmarkId) ?? null;
  }

  if (!bookmark) {
    return null;
  }

  if (includeImageData) {
    setCachedBookmark(bookmarkByIdCache, bookmarkId, bookmark);
    return bookmark;
  }

  const lightweight = stripImageData(bookmark);
  setCachedBookmark(lightweightBookmarkByIdCache, bookmarkId, lightweight);
  return lightweight;
}

/** Get bookmarks by tag with caching support */
export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
): Promise<{ bookmarks: UnifiedBookmark[]; totalCount: number; totalPages: number; fromCache: boolean }> {
  logBookmarkDataAccessEvent("getBookmarksByTag invoked", { tagSlug, pageNumber });
  const cachedPage = await getTagBookmarksPage(tagSlug, pageNumber);
  if (cachedPage.length > 0) {
    const index = await getTagBookmarksIndex(tagSlug);
    logBookmarkDataAccessEvent("Serving tag page from cache", {
      tagSlug,
      pageNumber,
      count: cachedPage.length,
    });
    return {
      bookmarks: cachedPage,
      totalCount: index?.count || cachedPage.length,
      totalPages: index?.totalPages || 1,
      fromCache: true,
    };
  }
  logBookmarkDataAccessEvent("Tag page cache miss, filtering full dataset", { tagSlug, pageNumber });

  // Check in-memory runtime cache first to avoid repeated S3 reads.
  // In test environment, bypass the in-process cache so each test can
  // provide different mocked datasets deterministically.
  let allBookmarks: UnifiedBookmark[];
  const now = getDeterministicTimestamp();
  const bypassMemoryCache = process.env.NODE_ENV === "test";

  if (
    !bypassMemoryCache &&
    fullDatasetMemoryCache &&
    now - fullDatasetMemoryCache.timestamp < FULL_DATASET_MEMORY_CACHE_TTL
  ) {
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
  const filteredBookmarks = allBookmarks.filter(b => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some(t => {
      const tagName = typeof t === "string" ? t : (t as { name: string }).name;
      return tagToSlug(tagName) === tagSlug;
    });
  });
  const totalCount = filteredBookmarks.length,
    totalPages = Math.ceil(totalCount / BOOKMARKS_PER_PAGE);
  const start = (pageNumber - 1) * BOOKMARKS_PER_PAGE,
    paginated = filteredBookmarks.slice(start, start + BOOKMARKS_PER_PAGE);
  logBookmarkDataAccessEvent("Tag page generated via filtered dataset", {
    tagSlug,
    pageNumber,
    count: paginated.length,
  });
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
    logBookmarkDataAccessEvent("Cache invalidated for bookmarks page", { pageNumber });
  }
};
export const invalidateBookmarksTagCache = (tagSlug: string): void => {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-tag-${tagSlug}`);
    logBookmarkDataAccessEvent("Cache invalidated for tag", { tagSlug });
  }
};
export const invalidateTagCache = invalidateBookmarksTagCache;
export const invalidateBookmarkCache = (bookmarkId: string): void => {
  bookmarkByIdCache.delete(bookmarkId);
  lightweightBookmarkByIdCache.delete(bookmarkId);
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmark-${bookmarkId}`);
    logBookmarkDataAccessEvent("Cache invalidated for bookmark", { bookmarkId });
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
  releaseRefreshLock().catch(error => console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)));
});
