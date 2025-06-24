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
import { tagToSlug } from "@/lib/utils/tag-utils";

// --- Configuration & Constants ---
const LOG_PREFIX = "[Bookmarks]";
const DISTRIBUTED_LOCK_S3_KEY = BOOKMARKS_S3_PATHS.LOCK;
const LOCK_TTL_MS = Number(process.env.BOOKMARKS_LOCK_TTL_MS) || 5 * 60 * 1000; // 5 minutes default
const LOCK_CLEANUP_INTERVAL_MS = 2 * 60 * 1000; // Check for stale locks every 2 minutes
const INSTANCE_ID = `instance-${randomInt(1000000, 9999999)}-${Date.now()}`;
const ENABLE_TAG_CACHING = process.env.ENABLE_TAG_CACHING !== 'false';
const MAX_TAGS_TO_CACHE = parseInt(process.env.MAX_TAGS_TO_CACHE || '10', 10);

// Module-scoped state
let isRefreshLocked = false;
let lockCleanupInterval: NodeJS.Timeout | null = null;
let inFlightGetPromise: Promise<UnifiedBookmark[] | LightweightBookmark[]> | null = null;
let inFlightRefreshPromise: Promise<UnifiedBookmark[] | null> | null = null;

// Type guard for S3 errors
const isS3Error = (err: unknown): err is { $metadata?: { httpStatusCode?: number } } => {
  return typeof err === 'object' && err !== null && '$metadata' in err;
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
            // Add a small delay to avoid race conditions
            await new Promise(resolve => setTimeout(resolve, 100));
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
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`, pageBookmarks);
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
  
  console.log(`${LOG_PREFIX} Processing ${topTags.length} of ${Object.keys(bookmarksByTag).length} tags (limited to top ${MAX_TAGS_TO_CACHE})`);
  
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
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`, tagIndex);
    
    // Write each page for this tag
    for (let page = 1; page <= totalPages; page++) {
      const start = (page - 1) * pageSize;
      const pageBookmarks = tagBookmarks.slice(start, start + pageSize);
      await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${page}.json`, pageBookmarks);
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
    await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, allIncomingBookmarks);
    // Write tag-filtered bookmarks
    await writeTagFilteredBookmarks(allIncomingBookmarks);

    return allIncomingBookmarks;
  } catch (error) {
    console.error(`${LOG_PREFIX} Error during selective refresh:`, String(error));
    return null;
  }
}

export function refreshAndPersistBookmarks(): Promise<UnifiedBookmark[] | null> {
  if (inFlightRefreshPromise) return inFlightRefreshPromise;

  const promise = (async () => {
    if (isRefreshLocked || !(await acquireRefreshLock())) return null;
    try {
      const useSelectiveRefresh = process.env.SELECTIVE_OG_REFRESH === "true";
      if (!useSelectiveRefresh) {
        if (!refreshBookmarksCallback) return null;
        const freshBookmarks = await refreshBookmarksCallback();
        if (freshBookmarks && freshBookmarks.length > 0) {
          const { isValid } = validateBookmarkDataset(freshBookmarks);
          if (isValid) {
            // Only write if changed
            const hasChanged = await hasBookmarksChanged(freshBookmarks);
            if (hasChanged) {
              console.log(`${LOG_PREFIX} Changes detected, writing to S3`);
              await writePaginatedBookmarks(freshBookmarks);
              // Also write full file for tag filtering operations
              await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, freshBookmarks);
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

async function fetchAndCacheBookmarks(options: BookmarkLoadOptions = {}): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  const { skipExternalFetch = false, includeImageData = true } = options;
  console.log(`${LOG_PREFIX} fetchAndCacheBookmarks called. skipExternalFetch=${skipExternalFetch}, includeImageData=${includeImageData}`);

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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const lightweightBookmarks: LightweightBookmark[] = bookmarks.map(({ content, ogImage, logoData, ...rest }) => ({
          ...rest,
          content: undefined,
          ogImage: undefined,
          logoData: undefined
        })) as LightweightBookmark[];
        return lightweightBookmarks;
      }

      return bookmarks;
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

  const refreshedBookmarks = await refreshAndPersistBookmarks();
  if (!refreshedBookmarks) return [];
  
  // Strip image data if not needed
  if (!includeImageData) {
    console.log(`${LOG_PREFIX} Stripping image data from refreshed bookmarks`);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const lightweightBookmarks: LightweightBookmark[] = refreshedBookmarks.map(({ content, ogImage, logoData, ...rest }) => ({
      ...rest,
      content: undefined,
      ogImage: undefined,
      logoData: undefined
    })) as LightweightBookmark[];
    return lightweightBookmarks;
  }
  
  return refreshedBookmarks;
}

// Get a specific page of bookmarks
export async function getBookmarksPage(pageNumber: number): Promise<UnifiedBookmark[]> {
  const pageKey = `${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(pageKey);
    return pageData ?? [];
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

// Get a specific page of tag-filtered bookmarks
export async function getTagBookmarksPage(tagSlug: string, pageNumber: number): Promise<UnifiedBookmark[]> {
  const pageKey = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  try {
    const pageData = await readJsonS3<UnifiedBookmark[]>(pageKey);
    return pageData ?? [];
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

// Get tag index with metadata
export async function getTagBookmarksIndex(tagSlug: string): Promise<BookmarksIndex | null> {
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

export async function getBookmarks(options: BookmarkLoadOptions = {}): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
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
  pageNumber: number = 1
): Promise<{
  bookmarks: UnifiedBookmark[];
  totalCount: number;
  totalPages: number;
  fromCache: boolean;
}> {
  console.log(`${LOG_PREFIX} getBookmarksByTag called with tagSlug: "${tagSlug}", pageNumber: ${pageNumber}`);
  
  // 1. Try cache first (if enabled and tag is cached)
  const pageKey = `${BOOKMARKS_S3_PATHS.TAG_PREFIX}${tagSlug}/page-${pageNumber}.json`;
  console.log(`${LOG_PREFIX} Attempting to read cached tag page from: ${pageKey}`);
  
  const cachedPage = await getTagBookmarksPage(tagSlug, pageNumber);
  console.log(`${LOG_PREFIX} Cached page result: ${cachedPage.length} bookmarks found`);
  
  if (cachedPage.length > 0) {
    const index = await getTagBookmarksIndex(tagSlug);
    console.log(`${LOG_PREFIX} Using cached data for tag "${tagSlug}"`);
    return {
      bookmarks: cachedPage,
      totalCount: index?.count || cachedPage.length,
      totalPages: index?.totalPages || 1,
      fromCache: true
    };
  }

  // 2. Cache miss - filter from all bookmarks (always get lightweight for tag filtering)
  const allBookmarks = await getBookmarks({ includeImageData: false }) as UnifiedBookmark[];
  const tagQuery = tagSlug.replace(/-/g, " ");
  
  // Filter bookmarks that have this tag
  const filtered = allBookmarks.filter((b) => {
    const tags = Array.isArray(b.tags) ? b.tags : [];
    return tags.some((t) => {
      const tagName = typeof t === "string" ? t : (t as { name: string }).name;
      return tagName.toLowerCase() === tagQuery.toLowerCase();
    });
  });

  // 3. Paginate the filtered results
  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / BOOKMARKS_PER_PAGE);
  const start = (pageNumber - 1) * BOOKMARKS_PER_PAGE;
  const paginated = filtered.slice(start, start + BOOKMARKS_PER_PAGE);

  return {
    bookmarks: paginated,
    totalCount,
    totalPages,
    fromCache: false
  };
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
