/**
 * @file Bookmark-specific utility functions.
 * @module lib/bookmarks/utils
 */

import type { BookmarkTag, RawApiBookmarkContent, UnifiedBookmark, RawBookmark } from "@/types/bookmark";
import type { SerializableBookmark } from "@/types/features/bookmarks";

/**
 * Calculates the date 30 days ago from the current time.
 * @returns {Date} The date 30 days ago.
 */
function thirtyDaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}

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
  const rest = { ...content };
  delete rest.htmlContent;
  return rest;
}

/**
 * Normalizes a tag from either a string or a BookmarkTag object
 * into a consistent, serializable format that matches SerializableBookmark requirements.
 *
 * @param tag The input tag (string or BookmarkTag object)
 * @returns A normalized tag object with required id field
 */
export function normalizeBookmarkTag(tag: string | BookmarkTag): {
  id: string;
  name: string;
  slug: string;
  color?: string;
} {
  if (typeof tag === "string") {
    return {
      id: tag,
      name: tag,
      slug: tag.toLowerCase().replace(/\s+/g, "-"),
      color: undefined,
    };
  }

  // Defensively handle malformed tag objects
  const name = tag?.name || "";
  return {
    id: tag?.id || name,
    name: name,
    slug: tag?.slug || name.toLowerCase().replace(/\s+/g, "-"),
    color: tag?.color,
  };
}

/**
 * Converts RawBookmark data to UnifiedBookmark format for client use.
 * This is for data coming directly from API validation (string tags).
 *
 * @param rawBookmarks - Array of raw bookmarks from an API or database
 * @returns Array of unified bookmarks for client use
 */
export function convertRawBookmarksToUnified(rawBookmarks: RawBookmark[]): UnifiedBookmark[] {
  return rawBookmarks.map(
    (bookmark) =>
      ({
        id: bookmark.id,
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description || "",
        tags: bookmark.tags || [],
        dateBookmarked: bookmark.dateBookmarked,
        dateCreated: bookmark.dateCreated,
        dateUpdated: bookmark.dateUpdated,
        isPrivate: bookmark.isPrivate,
        isFavorite: bookmark.isFavorite,
        readingTime: bookmark.readingTime,
        wordCount: bookmark.wordCount,
        // Add additional UnifiedBookmark fields with sensible defaults
        datePublished: null,
        modifiedAt: bookmark.dateUpdated,
        archived: false,
        taggingStatus: undefined,
        note: null,
        summary: null,
        content: undefined,
        assets: undefined,
        logoData: undefined,
        ogTitle: undefined,
        ogDescription: undefined,
        ogImage: undefined,
        ogUrl: undefined,
        domain: undefined,
        sourceUpdatedAt: bookmark.dateUpdated || bookmark.dateBookmarked,
        ogImageLastFetchedAt: undefined,
        ogImageEtag: undefined,
      }) as UnifiedBookmark,
  );
}

/**
 * Converts SerializableBookmark data (from server props) to UnifiedBookmark format.
 * This is for data that has already been partially processed and serialized.
 *
 * @param serializableBookmarks - Array of serializable bookmarks from server
 * @returns Array of unified bookmarks for client use
 */
export function convertSerializableBookmarksToUnified(
  serializableBookmarks: SerializableBookmark[],
): UnifiedBookmark[] {
  return serializableBookmarks.map(
    (bookmark) =>
      ({
        ...bookmark,
        description: bookmark.description || "",
      }) as UnifiedBookmark,
  );
}

/**
 * Checks if a bookmark's source data has been updated.
 *
 * @param {UnifiedBookmark} existingBookmark - The bookmark currently in our system.
 * @param {UnifiedBookmark} incomingBookmark - The bookmark from the fresh API fetch.
 * @returns {boolean} True if the source data has changed.
 */
export function isBookmarkSourceChanged(existingBookmark: UnifiedBookmark, incomingBookmark: UnifiedBookmark): boolean {
  // Compare the source 'modifiedAt' timestamp.
  const existingTimestamp = new Date(existingBookmark.sourceUpdatedAt).getTime();
  const incomingTimestamp = new Date(incomingBookmark.sourceUpdatedAt).getTime();
  return incomingTimestamp > existingTimestamp;
}

/**
 * Determines if a bookmark's OpenGraph image needs to be refreshed.
 *
 * This function uses a combination of a time-based TTL and ETag comparison.
 *
 * @param {UnifiedBookmark} bookmark - The bookmark to check.
 * @returns {Promise<boolean>} True if the image should be re-fetched.
 */
export async function shouldRefreshOgImage(bookmark: UnifiedBookmark): Promise<boolean> {
  const { ogImageLastFetchedAt, ogImageEtag, ogImage } = bookmark;
  const ogImageUrl = ogImage;

  // 1. If we have no image URL or have never fetched it, a refresh is needed.
  if (!ogImageUrl || !ogImageLastFetchedAt) {
    return true;
  }

  // 2. If the last fetch was more than 30 days ago, force a refresh to catch silent updates.
  if (new Date(ogImageLastFetchedAt) < thirtyDaysAgo()) {
    return true;
  }

  // 3. If we don't have a stored ETag, we can't compare, so refresh.
  if (!ogImageEtag) {
    return true;
  }

  // 4. Perform a HEAD request to get the current ETag of the remote image.
  try {
    // TypeScript narrowing: we've already checked ogImageUrl is truthy above
    const response = await fetch(ogImageUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      // If HEAD fails, assume it needs a refresh.
      return true;
    }
    const currentEtag = response.headers.get("etag");

    // 5. Compare ETags. If they are different, the image has changed.
    // Note: ETag comparison should be weak (e.g., W/"some-tag" should match "some-tag").
    const normalizeEtag = (tag: string | null) => tag?.replace(/^W\//, "").replace(/"/g, "");
    return normalizeEtag(currentEtag) !== normalizeEtag(ogImageEtag);
  } catch (error) {
    // If the HEAD request fails (e.g., timeout, network error, CORS issue),
    // assume a refresh is needed as we can't verify the image's status.
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[shouldRefreshOgImage] HEAD request failed for ${ogImageUrl}:`, errorMessage);
    return true;
  }
}
