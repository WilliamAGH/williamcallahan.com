/**
 * Utility functions for bookmarks module
 * @module lib/bookmarks/utils
 */

import type { RawApiBookmarkContent, UnifiedBookmark } from "@/types/bookmark";
import type { SerializableBookmark } from "@/types/features/bookmarks";

/**
 * Utility function to remove the potentially large `htmlContent` field from a bookmark's content object.
 * This is used to reduce the size of data stored in some caches or passed around.
 *
 * @template T - A type extending RawApiBookmarkContent.
 * @param {T} content - The bookmark content object.
 * @returns {Omit<T, 'htmlContent'>} The content object without the `htmlContent` property.
 * @internal
 */
export function omitHtmlContent<T extends RawApiBookmarkContent>(content: T): Omit<T, "htmlContent"> {
  // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-unused-vars
  const { htmlContent: _omit, ...rest } = content;
  return rest;
}

/**
 * Converts SerializableBookmark data to UnifiedBookmark format
 * @param serializableBookmarks - Array of serializable bookmarks from server
 * @returns Array of unified bookmarks for client use
 */
export function convertToUnifiedBookmarks(serializableBookmarks: SerializableBookmark[]): UnifiedBookmark[] {
  return serializableBookmarks.map(
    (bookmark) =>
      ({
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description || "",
        tags: bookmark.tags || [],
        ogImage: bookmark.ogImage || undefined,
        dateBookmarked: bookmark.dateBookmarked,
        dateCreated: bookmark.dateCreated,
        dateUpdated: bookmark.dateUpdated,
        // Add additional UnifiedBookmark fields with sensible defaults
        datePublished: null,
        createdAt: bookmark.dateCreated,
        modifiedAt: bookmark.dateUpdated,
        archived: false,
        favourited: bookmark.isFavorite || false,
        taggingStatus: undefined,
        note: null,
        summary: bookmark.ogDescription || null,
        content: undefined,
        assets: undefined,
        telegramUsername: undefined,
        // Include SerializableBookmark-specific fields
        logoData: bookmark.logoData,
        isPrivate: bookmark.isPrivate,
        isFavorite: bookmark.isFavorite,
        readingTime: bookmark.readingTime,
        wordCount: bookmark.wordCount,
        ogTitle: bookmark.ogTitle,
        ogDescription: bookmark.ogDescription,
        domain: bookmark.domain,
      }) as UnifiedBookmark,
  );
}
