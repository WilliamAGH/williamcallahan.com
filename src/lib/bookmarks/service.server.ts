/**
 * Unified Bookmarks Service - Single entry point for all bookmark operations
 */

import {
  getBookmarks as getBookmarksInternal,
  getBookmarksByTag as getBookmarksByTagInternal,
  getBookmarksIndex as getBookmarksIndexInternal,
  getBookmarksPage as getBookmarksPageInternal,
  getBookmarkById as getBookmarkByIdInternal,
  getTagBookmarksIndex as getTagBookmarksIndexInternal,
  getTagBookmarksPage as getTagBookmarksPageInternal,
  listTagSlugs as listTagSlugsInternal,
  resolveBookmarkTagSlug as resolveBookmarkTagSlugInternal,
} from "./bookmarks-data-access.server";
import { refreshBookmarksData } from "./bookmarks";
import {
  refreshAndPersistBookmarks,
  setRefreshBookmarksCallback,
  initializeBookmarksDataAccess,
} from "./refresh-logic.server";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";
import type { BookmarkLoadOptions, LightweightBookmark } from "@/types/bookmark";
import { envLogger } from "@/lib/utils/env-logger";
import { isBookmarkServiceLoggingEnabled } from "@/lib/bookmarks/config";

// Initialize the refresh callback
setRefreshBookmarksCallback((force?: boolean) => refreshBookmarksData(force));

/**
 * Get bookmarks from cache or PostgreSQL, with optional background refresh
 */
export async function getBookmarks(
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark[] | LightweightBookmark[]> {
  initializeBookmarksDataAccess();
  const result = await getBookmarksInternal(options);

  if (isBookmarkServiceLoggingEnabled) {
    envLogger.log(
      "getBookmarks",
      {
        skipExternalFetch: options.skipExternalFetch ?? false,
        includeImageData: options.includeImageData ?? true,
        force: options.force ?? false,
        resultCount: result.length,
      },
      { category: "BookmarksService" },
    );
  }
  return result;
}

export async function getBookmarkById(
  bookmarkId: string,
  options: BookmarkLoadOptions = {},
): Promise<UnifiedBookmark | LightweightBookmark | null> {
  initializeBookmarksDataAccess();
  return getBookmarkByIdInternal(bookmarkId, options);
}

/**
 * Force refresh bookmarks from external API
 */
export async function refreshBookmarks(force = false): Promise<UnifiedBookmark[] | null> {
  return refreshAndPersistBookmarks(force);
}

/**
 * Get bookmarks by tag with transparent caching
 */
export async function getBookmarksByTag(
  tagSlug: string,
  pageNumber: number = 1,
  pageSize?: number,
) {
  initializeBookmarksDataAccess();
  return getBookmarksByTagInternal(tagSlug, pageNumber, pageSize);
}

/**
 * Get a single page of bookmarks from cache or PostgreSQL
 */
export async function getBookmarksPage(
  pageNumber: number,
  pageSize?: number,
): Promise<UnifiedBookmark[]> {
  initializeBookmarksDataAccess();
  return getBookmarksPageInternal(pageNumber, pageSize);
}

/**
 * Get the main bookmarks index from cache or PostgreSQL
 */
export async function getBookmarksIndex(pageSize?: number) {
  initializeBookmarksDataAccess();
  return getBookmarksIndexInternal(pageSize);
}

export async function getTagBookmarksIndex(tagSlug: string, pageSize?: number) {
  initializeBookmarksDataAccess();
  return getTagBookmarksIndexInternal(tagSlug, pageSize);
}

export async function getTagBookmarksPage(
  tagSlug: string,
  pageNumber: number,
  pageSize?: number,
): Promise<UnifiedBookmark[]> {
  initializeBookmarksDataAccess();
  return getTagBookmarksPageInternal(tagSlug, pageNumber, pageSize);
}

export async function listBookmarkTagSlugs(): Promise<string[]> {
  initializeBookmarksDataAccess();
  return listTagSlugsInternal();
}

export async function resolveBookmarkTagSlug(tagSlug: string): Promise<{
  requestedSlug: string;
  canonicalSlug: string;
  canonicalTagName: string | null;
  isAlias: boolean;
}> {
  initializeBookmarksDataAccess();
  return resolveBookmarkTagSlugInternal(tagSlug);
}
