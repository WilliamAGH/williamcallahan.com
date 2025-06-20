/**
 * @module lib/server-cache/bookmarks
 * @description Domain-specific cache methods for bookmarks.
 * These methods are intended to be attached to the ServerCache prototype.
 */

import type { BookmarksCacheEntry, ICache } from "@/types/cache";
import type { UnifiedBookmark } from "@/types/bookmark";
import { rawBookmarkSchema } from "@/lib/schemas/bookmarks";
import { BOOKMARKS_CACHE_DURATION } from "@/lib/constants";

const BOOKMARKS_CACHE_KEY = "bookmarks-data";

export function getBookmarks(this: ICache): BookmarksCacheEntry | undefined {
  return this.get<BookmarksCacheEntry>(BOOKMARKS_CACHE_KEY);
}

export function setBookmarks(this: ICache, bookmarks: UnifiedBookmark[], isFailure = false): void {
  if (!isFailure && bookmarks.length > 0) {
    const sampleBookmark = bookmarks[0];
    if (sampleBookmark) {
      const validationResult = rawBookmarkSchema.safeParse({
        id: sampleBookmark.id,
        url: sampleBookmark.url,
        title: sampleBookmark.title,
        description: sampleBookmark.description,
        tags: Array.isArray(sampleBookmark.tags)
          ? sampleBookmark.tags.map((tag: string | { name: string }) => (typeof tag === "string" ? tag : tag.name))
          : [],
        dateBookmarked: sampleBookmark.dateBookmarked,
      });
      if (!validationResult.success) {
        console.warn(
          "[ServerCache] Bookmark data failed strict validation – falling back to lenient caching:",
          validationResult.error?.issues?.[0]?.message ?? validationResult.error,
        );
      }
    }
  }

  const now = Date.now();
  const existing = getBookmarks.call(this);

  const entry: BookmarksCacheEntry = {
    bookmarks: isFailure ? existing?.bookmarks || [] : bookmarks,
    lastFetchedAt: isFailure ? (existing?.lastFetchedAt ?? now) : now,
    lastAttemptedAt: now,
  };

  this.set(BOOKMARKS_CACHE_KEY, entry, isFailure ? BOOKMARKS_CACHE_DURATION.FAILURE : BOOKMARKS_CACHE_DURATION.SUCCESS);
}

export function shouldRefreshBookmarks(this: ICache): boolean {
  const cached = getBookmarks.call(this);
  if (!cached) {
    return true;
  }

  if (!cached.bookmarks || !Array.isArray(cached.bookmarks) || cached.bookmarks.length === 0) {
    return true;
  }

  const now = Date.now();
  const timeSinceLastFetch = now - cached.lastFetchedAt;
  const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;

  return timeSinceLastFetch > revalidationThreshold;
}

export function clearBookmarks(this: ICache): void {
  this.del(BOOKMARKS_CACHE_KEY);
}
