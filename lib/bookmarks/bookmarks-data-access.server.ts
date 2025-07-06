/** Bookmarks data access: In-memory → S3 → External API */

import { randomInt } from "node:crypto";
import { readJsonS3, writeJsonS3, deleteFromS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import type { UnifiedBookmark, DistributedLockEntry, RefreshBookmarksCallback } from "@/types";
import type { BookmarksIndex, BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { validateBookmarksDataset as validateBookmarkDataset } from "@/lib/validators/bookmarks";
import { BookmarksIndexSchema } from "@/lib/schemas/bookmarks";
import { tagToSlug } from "@/lib/utils/tag-utils";
import {
  normalizeBookmarkTag,
  calculateBookmarksChecksum,
  stripImageData,
  toLightweightBookmarks,
  normalizePageBookmarkTags,
} from "@/lib/bookmarks/utils";
import { USE_NEXTJS_CACHE, withCacheFallback } from "@/lib/cache";
import { unstable_cacheLife as cacheLife, unstable_cacheTag as cacheTag, revalidateTag } from "next/cache";

// Runtime-safe cache wrappers for experimental Next.js APIs
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
  if (typeof cacheLife === "function") cacheLife(profile as never);
};
const safeCacheTag = (...tags: string[]): void => {
  if (typeof cacheTag === "function") tags.forEach((tag) => cacheTag(tag));
};
const safeRevalidateTag = (tag: string): void => {
  if (typeof revalidateTag === "function") revalidateTag(tag);
};

const INSTANCE_ID = `instance-${randomInt(1000000, 9999999)}-${Date.now()}`;
const ENABLE_TAG_CACHING = process.env.ENABLE_TAG_CACHING !== "false";
const MAX_TAGS_TO_CACHE = parseInt(process.env.MAX_TAGS_TO_CACHE || "10", 10);

// In-process short-TTL cache parameters (centralized in lib/cache; local cache removed)

const LOG_PREFIX = "[BookmarksDataAccess]";
const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;
const LOCK_TTL_MS = Number(process.env.BOOKMARKS_LOCK_TTL_MS) || 5 * 60 * 1000;
const LOCK_CLEANUP_INTERVAL_MS = 2 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 50;

let isRefreshLocked = false;
let lockCleanupInterval: NodeJS.Timeout | null = null;
let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

const isS3Error = (err: unknown): err is { $metadata?: { httpStatusCode?: number } } =>
  typeof err === "object" && err !== null && "$metadata" in err;

/** S3 distributed lock management */
async function acquireDistributedLock(lockKey: string, ttlMs: number, retryCount = 0): Promise<boolean> {
  const MAX_RETRIES = 3;
  const lockEntry: DistributedLockEntry = { instanceId: INSTANCE_ID, acquiredAt: Date.now(), ttlMs };
  try {
    await writeJsonS3(lockKey, lockEntry, { IfNoneMatch: "*" });
    console.log(`${LOG_PREFIX} Distributed lock acquired atomically by ${INSTANCE_ID}`);
    return true;
  } catch (e: unknown) {
    if (isS3Error(e) && e.$metadata?.httpStatusCode === 412) {
      try {
        const existingLock = await readJsonS3<DistributedLockEntry>(lockKey);
        if (existingLock && typeof existingLock === "object") {
          const lockAge = Date.now() - existingLock.acquiredAt;
          if (lockAge > existingLock.ttlMs) {
            if (retryCount >= MAX_RETRIES) {
              console.error(`${LOG_PREFIX} Max retries (${MAX_RETRIES}) exceeded for acquiring lock`);
              return false;
            }
            await releaseDistributedLock(lockKey, true);
            // Wait for S3 eventual consistency
            for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
              try {
                await readJsonS3(lockKey);
                await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
              } catch (pollErr: unknown) {
                if (isS3Error(pollErr) && pollErr.$metadata?.httpStatusCode === 404) break;
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
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404)
      console.error(`${LOG_PREFIX} Error during distributed lock release:`, String(e));
  }
}

async function cleanupStaleLocks(): Promise<void> {
  try {
    const existingLock = await readJsonS3<DistributedLockEntry>(DISTRIBUTED_LOCK_S3_KEY);
    if (existingLock && typeof existingLock === "object" && Date.now() - existingLock.acquiredAt > existingLock.ttlMs) {
      await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY, true);
    }
  } catch (e: unknown) {
    if (!isS3Error(e) || e.$metadata?.httpStatusCode !== 404)
      console.debug(`${LOG_PREFIX} Error checking for stale locks:`, String(e));
  }
}

const acquireRefreshLock = async (): Promise<boolean> => {
  const locked = await acquireDistributedLock(DISTRIBUTED_LOCK_S3_KEY, LOCK_TTL_MS);
  if (locked) isRefreshLocked = true;
  return locked;
};

const releaseRefreshLock = async (): Promise<void> => {
  try {
    await releaseDistributedLock(DISTRIBUTED_LOCK_S3_KEY);
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
    cleanupStaleLocks().catch((error) =>
      console.debug("[Bookmarks] Initial lock cleanup check failed:", String(error)),
    );
    lockCleanupInterval = setInterval(() => {
      cleanupStaleLocks().catch((error) =>
        console.debug("[Bookmarks] Periodic lock cleanup check failed:", String(error)),
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

/** Write bookmarks in paginated format */
async function writePaginatedBookmarks(bookmarks: UnifiedBookmark[]): Promise<void> {
  const pageSize = BOOKMARKS_PER_PAGE,
    totalPages = Math.ceil(bookmarks.length / pageSize),
    now = Date.now();
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
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`, bookmarks.slice(start, start + pageSize));
  }
  console.log(`${LOG_PREFIX} Wrote ${totalPages} pages of bookmarks`);
}

/** Write tag-filtered bookmarks in paginated format */
async function writeTagFilteredBookmarks(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (!ENABLE_TAG_CACHING) {
    console.log(`${LOG_PREFIX} Tag caching disabled by environment variable`);
    return;
  }
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
  const topTags = Object.entries(tagCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_TAGS_TO_CACHE)
    .map(([tag]) => tag);
  console.log(
    `${LOG_PREFIX} Processing ${topTags.length} of ${Object.keys(bookmarksByTag).length} tags (limited to top ${MAX_TAGS_TO_CACHE})`,
  );
  for (const tagSlug of topTags) {
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
    };
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`, tagIndex);
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      await writeJsonS3(
        `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${page}.json`,
        tagBookmarks.slice(start, start + pageSize),
      );
    }
  }
  console.log(`${LOG_PREFIX} Wrote tag-filtered bookmarks for ${topTags.length} tags`);
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
      return allIncomingBookmarks;
    }
    console.log(`${LOG_PREFIX} Changes detected, persisting bookmarks`);
    await writePaginatedBookmarks(allIncomingBookmarks);
    await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, toLightweightBookmarks(allIncomingBookmarks));
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
            const hasChanged = await hasBookmarksChanged(freshBookmarks);
            if (hasChanged || force) {
              console.log(`${LOG_PREFIX} ${force ? "Forcing write" : "Changes detected"}, writing to S3`);
              await writePaginatedBookmarks(freshBookmarks);
              await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, toLightweightBookmarks(freshBookmarks));
              await writeTagFilteredBookmarks(freshBookmarks);
            } else console.log(`${LOG_PREFIX} No changes, skipping S3 write`);
            return freshBookmarks;
          }
          console.warn(`${LOG_PREFIX} Freshly fetched bookmarks are invalid.`);
          return null;
        }
        return null;
      }
      return await selectiveRefreshAndPersistBookmarks();
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to refresh bookmarks:`, String(error));
      return null;
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

async function fetchAndCacheBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  const { skipExternalFetch = false, includeImageData = true, force = false } = options;
  console.log(
    `${LOG_PREFIX} fetchAndCacheBookmarks called. skipExternalFetch=${skipExternalFetch}, includeImageData=${includeImageData}`,
  );
  const normalizeBookmarkTags = (bookmark: UnifiedBookmark) => ({
    ...bookmark,
    tags: (bookmark.tags || [])
      .filter((tag) => tag && (typeof tag === "string" ? tag.trim() : tag.name?.trim()))
      .map((tag: string | import("@/types").BookmarkTag) => normalizeBookmarkTag(tag)),
  });
  try {
    const bookmarks = await readJsonS3<UnifiedBookmark[]>(BOOKMARKS_S3_PATHS.FILE);
    if (bookmarks && Array.isArray(bookmarks) && bookmarks.length > 0) {
      console.log(`${LOG_PREFIX} Loaded ${bookmarks.length} bookmarks from S3`);
      const cliBookmark = bookmarks.find((b) => b.id === "yz7g8v8vzprsd2bm1w1cjc4y");
      if (cliBookmark) {
        console.log(`[BookmarksServer] CLI bookmark content exists:`, {
          hasContent: !!cliBookmark.content,
          hasImageAssetId: !!cliBookmark.content?.imageAssetId,
          imageAssetId: cliBookmark.content?.imageAssetId,
          contentKeys: cliBookmark.content ? Object.keys(cliBookmark.content) : [],
        });
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

async function getCachedBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife("hours");
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

async function getCachedTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  "use cache";
  safeCacheLife("hours");
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

async function getCachedTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife("hours");
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

async function getCachedBookmarksIndex(): Promise<BookmarksIndex | null> {
  "use cache";
  safeCacheLife("minutes");
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
  const allBookmarks = (await getBookmarks({ includeImageData: true })) as UnifiedBookmark[];
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

/** Cache invalidation functions */
export const invalidateBookmarksCache = (): void => {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("bookmarks");
    console.log("[Bookmarks] Cache invalidated for tag: bookmarks");
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

// Cleanup interval for stale locks
setInterval(
  () => {
    cleanupStaleLocks().catch((error) => console.error("[Bookmarks] Failed to cleanup stale locks:", String(error)));
  },
  2 * 60 * 1000,
);

// Cleanup cache and locks on process exit
process.on("SIGTERM", () => {
  releaseRefreshLock().catch((error) => console.error("[Bookmarks] Failed to release lock on cleanup:", String(error)));
});
