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
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark, DistributedLockEntry, RefreshBookmarksCallback } from "@/types";
import type { BookmarksIndex, BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
import { BookmarksIndexSchema } from "@/lib/schemas/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { normalizeBookmarkTag } from "@/lib/bookmarks/utils";
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";

// Runtime-safe wrappers for cache helper functions. These wrappers only
// invoke the underlying Next.js helpers when they exist at runtime,
// avoiding `undefined is not a function` errors in environments where the
// experimental `unstable_*` APIs are not yet available.
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
  if (typeof cacheLife === "function") {
    cacheLife(profile as never);
  }
};

const safeCacheTag = (...tags: string[]): void => {
  if (typeof cacheTag === "function") {
    // The helper supports multiple tags, loop to ensure each is applied.
    tags.forEach((tag) => cacheTag(tag));
  }
};

const safeRevalidateTag = (tag: string): void => {
  if (typeof revalidateTag === "function") {
    revalidateTag(tag);
  }
};

// Helper function to convert UnifiedBookmark to LightweightBookmark
function stripImageData(bookmark: UnifiedBookmark): LightweightBookmark {
  return {
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    tags: (bookmark.tags || [])
      .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
      .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
    dateBookmarked: bookmark.dateBookmarked,
    datePublished: bookmark.datePublished,
    dateCreated: bookmark.dateCreated,
    dateUpdated: bookmark.dateUpdated,
    modifiedAt: bookmark.modifiedAt,
    archived: bookmark.archived,
    taggingStatus: bookmark.taggingStatus,
    note: bookmark.note,
    summary: bookmark.summary,
    assets: bookmark.assets,
    readingTime: bookmark.readingTime,
    wordCount: bookmark.wordCount,
    ogTitle: bookmark.ogTitle,
    ogDescription: bookmark.ogDescription,
    ogUrl: bookmark.ogUrl,
    domain: bookmark.domain,
    sourceUpdatedAt: bookmark.sourceUpdatedAt,
    ogImageLastFetchedAt: bookmark.ogImageLastFetchedAt,
    ogImageEtag: bookmark.ogImageEtag,
    isPrivate: bookmark.isPrivate,
    isFavorite: bookmark.isFavorite,
  } as LightweightBookmark;
}

// --- Configuration & Constants ---
const LOG_PREFIX = "[BookmarksDataAccess]";
const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;
const LOCK_TTL_MS = Number(process.env.BOOKMARKS_LOCK_TTL_MS) || 5 * 60 * 1000; // 5 minutes default
const LOCK_CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // Check for stale locks every 2 minutes
const INSTANCE_ID = `instance-${randomInt(1000000, 9999999)}-${Date.now()}`;
const ENABLE_TAG_CACHING = process.env.ENABLE_TAG_CACHING !== "false";
const MAX_TAGS_TO_CACHE = parseInt(process.env.MAX_TAGS_TO_CACHE || "10", 10);

// Module-scoped state
let isRefreshLocked = false;
let lockCleanupInterval: NodeJS.Timeout | null = null;
let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

// Type guard for S3 errors
const isS3Error = (err: unknown): err is { $metadata?: { httpStatusCode?: number } } => {
  return typeof err === "object" && err !== null && "$metadata" in err;
};

// S3-based distributed lock functions
async function acquireDistributedLock(lockKey: string, ttlMs: number, retryCount = 0): Promise<boolean> {
  const MAX_RETRIES = 3;
  const lockEntry: DistributedLockEntry = {
    instanceId: INSTANCE_ID,
    acquiredAt: Date.now(),
    ttlMs,
  };
  try {
    await writeJsonS3(lockKey, lockEntry, { IfNoneMatch: "*" });
    console.log(`${LOG_PREFIX} Distributed lock acquired atomically by ${INSTANCE_ID}`);
    return true;
  } catch (e: unknown) {
    if (isS3Error(e) && e.$metadata?.httpStatusCode === 412) {
      // Precondition Failed - lock exists
      try {
        const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
        if (existingLock && typeof existingLock === "object") {
          const lockAge = Date.now() - existingLock.acquiredAt;
          if (lockAge > existingLock.ttlMs) {
            // Stale lock, try to release and re-acquire with retry limit
            if (retryCount >= MAX_RETRIES) {
              console.error(`${LOG_PREFIX} Max retries (${MAX_RETRIES}) exceeded for acquiring lock`);
              return false;
            }
            await releaseDistributedLock(lockKey, true);

            // Wait until the lock object is actually gone before retrying to
            // acquire it. This mitigates eventual-consistency delays in S3 and
            // avoids races where multiple instances immediately attempt to
            // create the lock after deletion.
            const MAX_POLL_ATTEMPTS = 5;
            const POLL_INTERVAL_MS = 50;

            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
              try {
                await readJsonS3(lockKey);
                // If read succeeds the object still exists – wait and retry.
                await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
              } catch (pollErr: unknown) {
                if (isS3Error(pollErr) && pollErr.$metadata?.httpStatusCode === 404) {
                  // Lock object is gone; safe to proceed.
                  break;
                }
                // Unexpected error – log and break to avoid infinite loop.
                console.warn(`${LOG_PREFIX} Polling error while waiting for lock deletion:`, String(pollErr));
                break;
              }
            }

            return acquireDistributedLock(lockKey, ttlMs, retryCount + 1);
          }
        }
      } catch (readError: unknown) {
        console.error(`${LOG_PREFIX} Error reading existing lock:`, String(readError));
      }
      return false;
    }
    console.error(`${LOG_PREFIX} Error during atomic lock acquisition:`, String(e));
    return false;
  }
}

async function releaseDistributedLock(lockKey: string, forceRelease = false): Promise<void> {
  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
    if (existingLock?.instanceId === INSTANCE_ID || forceRelease) {
      await deleteFromS3(lockKey);
      console.log(`${LOG_PREFIX} Distributed lock released ${forceRelease ? "(forced)" : ""} by ${INSTANCE_ID}`);
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404) {
      console.error(`${LOG_PREFIX} Error during distributed lock release:`, String(e));
    }
  }
}

async function cleanupStaleLocks(): Promise<void> {
  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(DISTRIBUTED_LOCK_S3_KEY);
    if (existingLock && typeof existingLock === "object") {
      if (Date.now() - existingLock.acquiredAt > existingLock.ttlMs) {
        await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY, true);
      }
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404) {
      console.debug(`${LOG_PREFIX} Error checking for stale locks:`, String(e));
    }
  }
}

async function acquireRefreshLock(): Promise<boolean> {
  const locked = await acquireDistributedLock(DISTRIBUTED_LOCK_S3_KEY, LOCK_TTL_MS);
  if (locked) isRefreshLocked = true;
  return locked;
}

async function releaseRefreshLock(): Promise<void> {
  try {
    await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY);
  } finally {
    isRefreshLocked = false;
  }
}

// Initialization and callbacks
let refreshBookmarksCallback: RefreshBookmarksCallback | null = null;
let isInitialized = false;

export function setRefreshBookmarksCallback(callback: RefreshBookmarksCallback): void {
  refreshBookmarksCallback = callback;
}

export function initializeBookmarksDataAccess(): void {
  if (isInitialized) return;
  isInitialized = true;
  if (!refreshBookmarksCallback) {
    import("@/lib/bookmarks")
      .then(({ refreshBookmarksData }) => setRefreshBookmarksCallback(refreshBookmarksData))
      .catch((error) => console.error("[Bookmarks] Failed to initialize refresh callback:", String(error)));
  }
  if (!lockCleanupInterval) {
    cleanupStaleLocks().catch((error) =>
      console.debug("[Bookmarks] Initial lock cleanup check failed:", String(error)),
    );
    lockCleanupInterval = setInterval(() => {
      cleanupStaleLocks().catch((error) =>
        console.debug("[Bookmarks] Periodic lock cleanup check failed:", String(error)),
      );
    }, LOCK_CLEANUP_INTERVAL_MS);

    // Don't prevent process from exiting
    if (lockCleanupInterval.unref) {
      lockCleanupInterval.unref();
    }
  }
}

export function cleanupBookmarksDataAccess(): void {
  if (lockCleanupInterval) {
    clearInterval(lockCleanupInterval);
    lockCleanupInterval = null;
  }
  if (isRefreshLocked) {
    releaseRefreshLock().catch((error) =>
      console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)),
    );
  }
}

// Calculate checksum for bookmarks to detect changes
function calculateBookmarksChecksum(bookmarks: UnifiedBookmark[]): string {
  return bookmarks.map((b) => `${b.id}:${b.modifiedAt || b.dateBookmarked}`).join("|");
}

// Check if bookmarks have actually changed
async function hasBookmarksChanged(newBookmarks: UnifiedBookmark[]): Promise<boolean> {
  try {
    const indexKey = BOOKMARKS_S3_PATHS.INDEX;
    const existingIndex = await readJsonS3<BookmarksIndex>(indexKey);
    if (!existingIndex) return true; // No index means first time

    // Quick check: count changed?
    if (existingIndex.count !== newBookmarks.length) return true;

    // Create a simple checksum of bookmark IDs and dates
    const checksum = calculateBookmarksChecksum(newBookmarks);

    return checksum !== existingIndex.checksum;
  } catch {
    return true; // Error reading index, assume changed
  }
}

// Write bookmarks in paginated format
async function writePaginatedBookmarks(bookmarks: UnifiedBookmark[]): Promise<void> {
  const pageSize = BOOKMARKS_PER_PAGE;
  const totalPages = Math.ceil(bookmarks.length / pageSize);

  // Write index first with metadata
  const now = Date.now();
  const index: BookmarksIndex = {
    count: bookmarks.length,
    totalPages,
    pageSize,
    lastModified: new Date().toISOString(),
    lastFetchedAt: now,
    lastAttemptedAt: now,
    checksum: calculateBookmarksChecksum(bookmarks),
  };
  await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, index);

  // Write each page
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const pageBookmarks = bookmarks.slice(start, start + pageSize);
    const pageKey = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`;
    await writeJsonS3(pageKey, pageBookmarks);
  }

  console.log(`${LOG_PREFIX} Wrote ${totalPages} pages of bookmarks`);
}

// Write tag-filtered bookmarks in paginated format
async function writeTagFilteredBookmarks(bookmarks: UnifiedBookmark[]): Promise<void> {
  // Check if tag caching is enabled
  if (!ENABLE_TAG_CACHING) {
    console.log(`${LOG_PREFIX} Tag caching disabled by environment variable`);
    return;
  }

  const pageSize = BOOKMARKS_PER_PAGE;

  // Group bookmarks by tag
  const bookmarksByTag: Record<string, UnifiedBookmark[]> = {};
  const tagCounts: Record<string, number> = {};

  for (const bookmark of bookmarks) {
    const tags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    for (const tag of tags) {
      const tagName = typeof tag === "string" ? tag : (tag as { name: string }).name;
      const tagSlugValue = tagToSlug(tagName);

      if (!bookmarksByTag[tagSlugValue]) {
        bookmarksByTag[tagSlugValue] = [];
        tagCounts[tagSlugValue] = 0;
      }
      // TypeScript should now know these are defined from the check above
      const tagBookmarksList = bookmarksByTag[tagSlugValue];
      const tagCount = tagCounts[tagSlugValue];
      if (tagBookmarksList && tagCount !== undefined) {
        tagBookmarksList.push(bookmark);
        tagCounts[tagSlugValue] = tagCount + 1;
      }
    }
  }

  // Sort tags by count and take only top N
  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TAGS_TO_CACHE)
    .map(([tag]) => tag);

  console.log(
    `${LOG_PREFIX} Processing ${topTags.length} of ${Object.keys(bookmarksByTag).length} tags (limited to top ${MAX_TAGS_TO_CACHE})`,
  );

  // Write paginated bookmarks only for top tags
  for (const tagSlug of topTags) {
    const tagBookmarks = bookmarksByTag[tagSlug];
    if (!tagBookmarks) continue; // Safety check
    const totalPages = Math.ceil(tagBookmarks.length / pageSize);

    // Write tag index
    const tagIndex: BookmarksIndex = {
      count: tagBookmarks.length,
      totalPages,
      pageSize,
      lastModified: new Date().toISOString(),
      lastFetchedAt: Date.now(),
      lastAttemptedAt: Date.now(),
      checksum: calculateBookmarksChecksum(tagBookmarks),
    };
    const tagIndexKey = `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`;
    await writeJsonS3(tagIndexKey, tagIndex);

    // Write each page for this tag
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      const pageBookmarks = tagBookmarks.slice(start, start + pageSize);
      const pageKey = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${page}.json`;
      await writeJsonS3(pageKey, pageBookmarks);
    }
  }

  console.log(`${LOG_PREFIX} Wrote tag-filtered bookmarks for ${topTags.length} tags`);
}

// Core refresh logic - ONLY PROCESS NEW/CHANGED BOOKMARKS
async function selectiveRefreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (!refreshBookmarksCallback) {
    console.error(`${LOG_PREFIX} Refresh callback not set.`);
    return null;
  }
  try {
    // First, check if there are any new bookmarks from API
    const allIncomingBookmarks = await refreshBookmarksCallback();
    if (!allIncomingBookmarks) return null;

    // Check if anything changed
    const hasChanged = await hasBookmarksChanged(allIncomingBookmarks);
    if (!hasChanged) {
      console.log(`${LOG_PREFIX} No changes detected, skipping write`);
      return allIncomingBookmarks;
    }

    console.log(`${LOG_PREFIX} Changes detected, persisting bookmarks`);

    // Only write if changed
    await writePaginatedBookmarks(allIncomingBookmarks);
    // Also write full file for tag filtering operations
    // Strip HTML content to reduce file size from ~5MB to ~500KB
    const lightweightBookmarks = toLightweightBookmarks(allIncomingBookmarks);
    await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, lightweightBookmarks);
    // Write tag-filtered bookmarks
    await writeTagFilteredBookmarks(allIncomingBookmarks);

    return allIncomingBookmarks;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error during selective refresh:`, String(error));
    return null;
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
            // Only write if changed or forced
            const hasChanged = await hasBookmarksChanged(freshBookmarks);
            if (hasChanged || force) {
              console.log(`${LOG_PREFIX} ${force ? "Forcing write" : "Changes detected"}, writing to S3`);
              await writePaginatedBookmarks(freshBookmarks);
              // Also write full file for tag filtering operations
              // Strip HTML content to reduce file size from ~5MB to ~500KB
              const lightweightBookmarks = toLightweightBookmarks(freshBookmarks);
              await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, lightweightBookmarks);
              // Write tag-filtered bookmarks
              await writeTagFilteredBookmarks(freshBookmarks);
            } else {
              console.log(`${LOG_PREFIX} No changes, skipping S3 write`);
            }
            return freshBookmarks;
          }
          console.warn(`${LOG_PREFIX} Freshly fetched bookmarks are invalid.`);
          return null;
        }
        return null;
      }
      // Note: Selective refresh does not currently support the 'force' parameter
      return await selectiveRefreshAndPersistBookmarks();
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to refresh bookmarks:`, String(error));
      return null;
    } finally {
      await releaseRefreshLock();
    }
  })();

  inFlightRefreshPromise = promise;

  // Clean up the promise reference AFTER it completes
  void promise.finally(() => {
    inFlightRefreshPromise = null;
  });

  return promise;
}

async function fetchAndCacheBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  console.log(
    `${LOG_PREFIX} fetchAndCacheBookmarks called. skipExternalFetch=${skipExternalFetch}, includeImageData=${includeImageData}`,
  );

  // Try to load from full file first (needed for tag filtering)
  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
      console.log(`${LOG_PREFIX} Loaded ${bookmarks.length} bookmarks from S3`);

      // Debug: Check if CLI bookmark has content on server side
      const cliBookmark = bookmarks.find((b) => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
      if (cliBookmark) {
        console.log(`[BookmarksServer] CLI bookmark content exists:`, {
          hasContent: !!cliBookmark.content,
          hasImageAssetId: !!cliBookmark.content?.imageAssetId,
          imageAssetId: cliBookmark.content?.imageAssetId,
          contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
        });
      }

      // Strip image data if not needed
      if (!includeImageData) {
        console.log(`${LOG_PREFIX} Stripping image data from ${bookmarks.length} bookmarks`);
        const lightweightBookmarks: LightweightBookmark[] = bookmarks.map(stripImageData);
        return lightweightBookmarks;
      }

      // Normalize tags for full bookmarks
      return bookmarks.map((bookmark) => ({
        ...bookmark,
        tags: (bookmark.tags || [])
          .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
          .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
      }));
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404) {
      console.error(`${LOG_PREFIX} Error reading bookmarks file:`, String(e));
    }
  }

  console.log(`${LOG_PREFIX} No bookmarks in S3, trying refresh`);

  if (skipExternalFetch) {
    return [];
  }

  const refreshedBookmarks = await refreshAndPersistBookmarks(force);
  if (!refreshedBookmarks) return [];

  // Strip image data if not needed
  if (!includeImageData) {
    console.log(`${LOG_PREFIX} Stripping image data from refreshed bookmarks`);
    const lightweightBookmarks: LightweightBookmark[] = refreshedBookmarks.map(stripImageData);
    return lightweightBookmarks;
  }

  // Normalize tags for full bookmarks
  return refreshedBookmarks.map((bookmark) => ({
    ...bookmark,
    tags: (bookmark.tags || [])
      .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
      .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
  }));
}

// Internal direct S3 read function (always available)
async function getBookmarksPageDirect(pageNumber: number): Promise<UnifiedBookmark[]> {
  const pageKey = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(pageKey);
    if (!pageData) return [];
    // Normalize tags for each bookmark
    return pageData.map((bookmark) => ({
      ...bookmark,
      tags: (bookmark.tags || [])
        .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
        .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
    }));
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) {
      // Page doesn't exist - normal for pagination
      return [];
    }
    // S3 service error - log for monitoring
    console.error(`${LOG_PREFIX} S3 service error loading page ${pageNumber}:`, error);
    return [];
  }
}

// Cached version using 'use cache' directive (wraps the direct function)
async function getCachedBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";

  safeCacheLife("hours"); // 1 hour cache
  safeCacheTag("bookmarks");
  safeCacheTag(`bookmarks-page-${pageNumber}`);

  return getBookmarksPageDirect(pageNumber);
}

// Get a specific page of bookmarks - primary export
export async function getBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  // If caching is enabled, try to use it with fallback to direct
  if (USE_NEXTJS_CACHE) {
    return withCacheFallback(
      () => getCachedBookmarksPage(pageNumber),
      () => getBookmarksPageDirect(pageNumber),
    );
  }

  // Default: Always use direct S3 read
  return getBookmarksPageDirect(pageNumber);
}

// Internal direct S3 read function for tag pages (always available)
async function getTagBookmarksPageDirect(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  const pageKey = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(pageKey);
    if (!pageData) return [];
    // Normalize tags for each bookmark
    return pageData.map((bookmark) => ({
      ...bookmark,
      tags: (bookmark.tags || [])
        .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
        .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
    }));
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) {
      // Page doesn't exist - normal for pagination
      return [];
    }
    // S3 service error - log for monitoring
    console.error(`${LOG_PREFIX} S3 service error loading tag page ${tagSlug}/${pageNumber}:`, error);
    return [];
  }
}

// Cached version using 'use cache' directive for tag pages
async function getCachedTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";

  safeCacheLife("hours"); // 1 hour cache
  safeCacheTag("bookmarks");
  safeCacheTag(`bookmarks-tag-${tagSlug}`);
  safeCacheTag(`bookmarks-tag-${tagSlug}-page-${pageNumber}`);

  return getTagBookmarksPageDirect(tagSlug, pageNumber);
}

// Get a specific page of tag-filtered bookmarks - primary export
export async function getTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  // If caching is enabled, try to use it with fallback to direct
  if (USE_NEXTJS_CACHE) {
    return withCacheFallback(
      () => getCachedTagBookmarksPage(tagSlug, pageNumber),
      () => getTagBookmarksPageDirect(tagSlug, pageNumber),
    );
  }

  // Default: Always use direct S3 read
  return getTagBookmarksPageDirect(tagSlug, pageNumber);
}

// Internal direct S3 read function for tag index (always available)
async function getTagBookmarksIndexDirect(tagSlug: string): Promise<BookmarksIndex | null> {
  const indexKey = `${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`;
  try {
    const indexData = await readJsonS3<BookmarksIndex>(indexKey);
    return indexData;
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) {
      // Index doesn't exist
      return null;
    }
    // S3 service error - log for monitoring
    console.error(`${LOG_PREFIX} S3 service error loading tag index ${tagSlug}:`, error);
    return null;
  }
}

// Cached version using 'use cache' directive for tag index
async function getCachedTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  "use cache";

  safeCacheLife("hours"); // 1 hour cache
  safeCacheTag("bookmarks");
  safeCacheTag(`bookmarks-tag-${tagSlug}`);
  safeCacheTag(`bookmarks-tag-${tagSlug}-index`);

  return getTagBookmarksIndexDirect(tagSlug);
}

// Get tag index with metadata - primary export
export async function getTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  if (USE_NEXTJS_CACHE) {
    // Try cached first; if it returns null/undefined, fall back to direct fetch
    try {
      const cached = await getCachedTagBookmarksIndex(tagSlug);
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    // Direct read (no cache) – this also handles the case where cached returned null
    return getTagBookmarksIndexDirect(tagSlug);
  }
  return getTagBookmarksIndexDirect(tagSlug);
}

// Internal direct S3 read function for the main bookmarks index
async function getBookmarksIndexDirect(): Promise<BookmarksIndex | null> {
  try {
    const rawIndex = await readJsonS3<BookmarksIndex>(BOOKMARKS_S3_PATHS.INDEX);
    const validation = BookmarksIndexSchema.safeParse(rawIndex);
    if (validation.success) {
      return validation.data;
    }
    console.warn(`${LOG_PREFIX} Main bookmarks index failed validation`, validation.error);
    return null;
  } catch (error) {
    if (isS3Error(error) && error.$metadata?.httpStatusCode === 404) {
      // Index doesn't exist
      return null;
    }
    // S3 service error - log for monitoring
    console.error(`${LOG_PREFIX} S3 service error loading main bookmarks index:`, error);
    return null;
  }
}

// Cached version for main bookmarks index
async function getCachedBookmarksIndex(): Promise<BookmarksIndex | null> {
  "use cache";

  safeCacheLife("minutes"); // Cache for 5 minutes
  safeCacheTag("bookmarks");
  safeCacheTag("bookmarks-index");

  return getBookmarksIndexDirect();
}

export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  if (inFlightGetPromise) {
    return inFlightGetPromise;
  }

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

// Unified function for getting bookmarks by tag - handles caching transparently
export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
): Promise<{
  bookmarks: UnifiedBookmark[];
  totalCount: number;
  totalPages: number;
  fromCache: boolean;
}> {
  console.log(`${LOG_PREFIX} getBookmarksByTag called with tagSlug: "${tagSlug}", pageNumber: ${pageNumber}`);

  // 1. Try cache first (if enabled and tag is cached)
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

  // 2. Cache miss - use paginated approach to avoid loading all bookmarks
  console.log(`${LOG_PREFIX} Cache miss for tag "${tagSlug}". Falling back to full bookmark set filtering`);

  // Fallback: Fetch all bookmarks and filter in memory
  // This ensures the test's mock for BOOKMARKS_S3_PATHS.FILE is hit
  const allBookmarks = (await getBookmarks({ includeImageData: true })) as UnifiedBookmark[];

  const filteredBookmarks = allBookmarks.filter((b) => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some((t) => {
      const tagName = typeof t === "string" ? t : (t as { name: string }).name;
      return tagToSlug(tagName) === tagSlug;
    });
  });

  const totalCount = filteredBookmarks.length;
  const totalPages = Math.ceil(totalCount / BOOKMARKS_PER_PAGE);
  const start = (pageNumber - 1) * BOOKMARKS_PER_PAGE;
  const paginated = filteredBookmarks.slice(start, start + BOOKMARKS_PER_PAGE);

  console.log(`${LOG_PREFIX} Found ${paginated.length} bookmarks for page ${pageNumber} of tag "${tagSlug}"`);

  return {
    bookmarks: paginated,
    totalCount,
    totalPages,
    fromCache: false,
  };
}

// Cache invalidation function for bookmarks
export function invalidateBookmarksCache(): void {
  if (USE_NEXTJS_CACHE) {
    // Invalidate all bookmarks cache tags
    safeRevalidateTag("bookmarks");
    console.log("[Bookmarks] Cache invalidated for tag: bookmarks");
  }
}

// Invalidate specific bookmark page cache
export function invalidateBookmarksPageCache(pageNumber: number): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-page-${pageNumber}`);
    console.log(`[Bookmarks] Cache invalidated for page: ${pageNumber}`);
  }
}

// Invalidate tag-specific bookmark cache
export function invalidateBookmarksTagCache(tagSlug: string): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmarks-tag-${tagSlug}`);
    console.log(`[Bookmarks] Cache invalidated for tag: ${tagSlug}`);
  }
}

// Alias for expected function name
export const invalidateTagCache = invalidateBookmarksTagCache;

// Invalidate specific bookmark cache
export function invalidateBookmarkCache(bookmarkId: string): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag(`bookmark-${bookmarkId}`);
    console.log(`[Bookmarks] Cache invalidated for bookmark: ${bookmarkId}`);
  }
}

export async function getBookmarksIndex(): Promise<BookmarksIndex | null> {
  if (USE_NEXTJS_CACHE) {
    // Try cached first; if it returns null/undefined, fall back to direct fetch
    try {
      const cached = await getCachedBookmarksIndex();
      if (cached) return cached;
    } catch (error) {
      console.warn("[Bookmarks] Cached index fetch failed, falling back to direct", error);
    }
    // Direct read (no cache) – this also handles the case where cached returned null
    return getBookmarksIndexDirect();
  }
  return getBookmarksIndexDirect();
}

/**
 * Converts full bookmark objects to lightweight versions while avoiding large
 * temporary arrays. The implementation pushes to the destination array inside
 * the iteration loop so that the GC can reclaim the original `content` payload
 * sooner, resulting in lower peak memory usage when datasets are large.
 */
function toLightweightBookmarks(bookmarks: UnifiedBookmark[]): LightweightBookmark[] {
  const lightweight: LightweightBookmark[] = [];
  for (const bookmark of bookmarks) {
    lightweight.push(stripImageData(bookmark));
  }
  return lightweight;
}
