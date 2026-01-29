/**
 * @file S3 persistence operations for bookmarks
 * @module lib/bookmarks/persistence.server
 *
 * Handles writing bookmark data to S3 in various formats:
 * - Paginated pages
 * - Individual bookmark files (by-id)
 * - Tag-filtered collections
 * - Master bookmark file
 */

import { writeJsonS3, listS3Objects, deleteFromS3 } from "@/lib/s3-utils";
import { BOOKMARKS_S3_PATHS, BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { envLogger } from "@/lib/utils/env-logger";
import type { UnifiedBookmark } from "@/types";
import type { BookmarksIndex } from "@/types/bookmark";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import { saveSlugMapping, generateSlugMapping } from "@/lib/bookmarks/slug-manager";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { getDeterministicTimestamp } from "@/lib/server-cache";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  isBookmarkServiceLoggingEnabled,
  ENABLE_TAG_PERSISTENCE,
  MAX_TAGS_TO_PERSIST,
  LOG_PREFIX,
  BOOKMARK_SERVICE_LOG_CATEGORY,
  BOOKMARK_WRITE_BATCH_SIZE,
} from "@/lib/bookmarks/config";
import { invalidateBookmarkByIdCaches, clearFullDatasetCache } from "@/lib/bookmarks/cache-management.server";

const LOCAL_BOOKMARKS_BY_ID_DIR = path.join(process.cwd(), ".next", "cache", "bookmarks", "by-id");
const LOCAL_BOOKMARKS_PATH = path.join(process.cwd(), "generated", "bookmarks", "bookmarks.json");

const logBookmarkDataAccessEvent = (message: string, data?: Record<string, unknown>): void => {
  if (!isBookmarkServiceLoggingEnabled) return;
  envLogger.log(message, data, { category: BOOKMARK_SERVICE_LOG_CATEGORY });
};

/**
 * Write bookmarks in paginated format to S3.
 * Bookmarks must already have slugs embedded.
 *
 * @param bookmarks - Bookmarks with embedded slugs
 * @returns The slug mapping used for the write
 */
export async function writePaginatedBookmarks(
  bookmarks: UnifiedBookmark[],
): Promise<import("@/types/bookmark").BookmarkSlugMapping> {
  const pageSize = BOOKMARKS_PER_PAGE;
  const totalPages = Math.ceil(bookmarks.length / pageSize);
  const now = getDeterministicTimestamp();

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
  // Write pages with bookmarks ensuring they have embedded slugs
  for (let page = 1; page <= totalPages; page++) {
    const start = (page - 1) * pageSize;
    const slice = bookmarks.slice(start, start + pageSize).map(b => {
      const entry = mapping.slugs[b.id];
      if (!entry) {
        throw new Error(`${LOG_PREFIX} Missing slug mapping for bookmark id=${b.id} (page ${page})`);
      }
      return { ...b, slug: entry.slug };
    });
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.PAGE_PREFIX}${page}.json`, slice);
  }
  await writeJsonS3(BOOKMARKS_S3_PATHS.INDEX, index);
  logBookmarkDataAccessEvent("Wrote bookmarks pages with embedded slugs", { totalPages });

  // Save slug mapping for backward compatibility and static generation
  try {
    await saveSlugMapping(bookmarks, true, false);
    logBookmarkDataAccessEvent("Saved slug mapping after writing pages", {
      bookmarkCount: bookmarks.length,
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Warning: Failed to save slug mapping (bookmarks have embedded slugs):`, error);
    // Not critical since bookmarks have embedded slugs
  }

  return mapping;
}

/**
 * Write bookmarks to local filesystem cache for fallback serving.
 *
 * @param bookmarks - The bookmarks to cache
 * @param context - Description of why this write is happening (for logging)
 * @returns WriteResult indicating success or failure with error details
 */
export async function writeLocalBookmarksCache(
  bookmarks: UnifiedBookmark[],
  context: string,
): Promise<import("@/types/lib").WriteResult> {
  try {
    await fs.mkdir(path.dirname(LOCAL_BOOKMARKS_PATH), { recursive: true });
    await fs.writeFile(LOCAL_BOOKMARKS_PATH, JSON.stringify(bookmarks, null, 2));
    logBookmarkDataAccessEvent(`Saved bookmarks to local fallback path${context ? ` (${context})` : ""}`, {
      path: LOCAL_BOOKMARKS_PATH,
      bookmarkCount: bookmarks.length,
    });
    return { success: true };
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error(
      `${LOG_PREFIX} ⚠️ Failed to save bookmarks to local fallback path${context ? ` (${context})` : ""}:`,
      error,
    );
    return { success: false, error: normalizedError };
  }
}

/**
 * Write individual bookmark files to S3 and local cache.
 * Processes in batches to avoid rate limiting.
 *
 * @param bookmarks - Bookmarks to write (must have slugs)
 */
export async function writeBookmarksByIdFiles(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (bookmarks.length === 0) return;
  for (let i = 0; i < bookmarks.length; i += BOOKMARK_WRITE_BATCH_SIZE) {
    const batch = bookmarks.slice(i, i + BOOKMARK_WRITE_BATCH_SIZE);
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

/**
 * Clean up orphaned local bookmark-by-id cache files.
 *
 * @param activeIds - Set of currently active bookmark IDs
 * @returns Number of files deleted
 */
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

/**
 * Clean up orphaned S3 bookmark-by-id files.
 *
 * @param activeIds - Set of currently active bookmark IDs
 * @returns Number of files deleted
 */
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

/**
 * Clean up orphaned bookmark-by-id files in both local cache and S3.
 *
 * @param bookmarks - Current active bookmarks
 */
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

/**
 * Write master bookmark files (full dataset + individual files).
 * Also cleans up orphaned files.
 *
 * @param bookmarksWithSlugs - Bookmarks with embedded slugs
 */
export async function writeBookmarkMasterFiles(bookmarksWithSlugs: UnifiedBookmark[]): Promise<void> {
  invalidateBookmarkByIdCaches();
  await cleanupOrphanedBookmarkByIdFiles(bookmarksWithSlugs);
  await writeJsonS3(BOOKMARKS_S3_PATHS.FILE, bookmarksWithSlugs);
  await writeBookmarksByIdFiles(bookmarksWithSlugs);
}

/**
 * Persist pre-computed tag-filtered bookmarks to S3 storage in paginated format.
 * Clears in-memory cache after writes to reduce staleness.
 *
 * @param bookmarks - Full bookmark dataset to filter and persist by tag
 */
export async function persistTagFilteredBookmarksToS3(bookmarks: UnifiedBookmark[]): Promise<void> {
  if (!ENABLE_TAG_PERSISTENCE) {
    envLogger.log("Tag persistence disabled by environment variable", undefined, {
      category: LOG_PREFIX,
    });
    return;
  }

  // Build a mapping once for this write to embed slugs
  const mapping = generateSlugMapping(bookmarks);
  const pageSize = BOOKMARKS_PER_PAGE;
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
    {
      totalTags: allTags.length,
      persistingCount: tagsToProcess.length,
      limit: MAX_TAGS_TO_PERSIST,
    },
    { category: LOG_PREFIX },
  );

  for (const tagSlug of tagsToProcess) {
    const tagBookmarks = bookmarksByTag[tagSlug];
    if (!tagBookmarks) continue;

    const totalPages = Math.ceil(tagBookmarks.length / pageSize);
    const now = getDeterministicTimestamp();

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
    await writeJsonS3(`${BOOKMARKS_S3_PATHS.TAG_INDEX_PREFIX}${tagSlug}/index.json`, tagIndex);
  }

  envLogger.log(
    `Persisted tag-filtered bookmarks to S3`,
    { tagCount: tagsToProcess.length, totalTags: allTags.length },
    { category: LOG_PREFIX },
  );

  // Reduce staleness window by clearing in-memory dataset cache after writes
  clearFullDatasetCache();
}
