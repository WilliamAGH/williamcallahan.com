/**
 * Bookmarks Server Component
 * @module components/features/bookmarks/bookmarks.server
 * @description
 * Server component that fetches bookmarks data and passes it to the client component.
 */
import "server-only"; // Ensure this component remains server-only

// Defer heavy imports to reduce initial bundle size
const getBookmarks = async () => (await import("@/lib/bookmarks/service.server")).getBookmarks;
const normalizeBookmarkTag = async () => (await import("@/lib/bookmarks/utils")).normalizeBookmarkTag;
const getServerCache = async () => (await import("@/lib/server-cache")).ServerCacheInstance;
import type { UnifiedBookmark } from "@/types";
import { BookmarksClientWithWindow } from "./bookmarks-client-with-window";

import type { JSX } from "react";

import type { BookmarksServerExtendedProps, SerializableBookmark } from "@/types";

/**
 * Server-side React component that prepares and provides bookmark data to the client component.
 *
 * Fetches and sorts bookmarks by date if not provided via props, and passes all relevant data to {@link BookmarksClientWithWindow}.
 *
 * @remark Throws an error with message 'BookmarksUnavailable' in production if no bookmarks are available from either props or API, triggering an error boundary.
 *
 * @returns The rendered {@link BookmarksClientWithWindow} component with bookmark data and related props.
 *
 * @throws {Error} If no bookmarks are available in production mode.
 */
export async function BookmarksServer({
  title,
  description,
  bookmarks: propsBookmarks,
  showFilterBar,
  titleSlug,
  initialPage,
  baseUrl,
  usePagination = true,
  initialTag,
  tag,
}: BookmarksServerExtendedProps): Promise<JSX.Element> {
  // If bookmarks are provided via props, use those; otherwise fetch from API
  let bookmarks: UnifiedBookmark[] = [];

  // Helper function to sort bookmarks by date (newest first)
  const sortByDateDesc = (list: UnifiedBookmark[]) =>
    [...list].sort((a, b) => {
      const safeTs = (d?: string) => {
        const ts = d ? Date.parse(d) : Number.NaN;
        return Number.isFinite(ts) ? ts : 0;
      };
      return safeTs(b.dateBookmarked) - safeTs(a.dateBookmarked);
    });

  // If bookmarks are provided via props (e.g., pre-filtered for tags), use those
  if (propsBookmarks) {
    // Apply the same consistent sorting even when bookmarks are provided externally
    bookmarks = sortByDateDesc(propsBookmarks);
    console.log("[BookmarksServer] Using provided bookmarks, count:", bookmarks.length);
  } else {
    // Fetch bookmarks. If getBookmarks() throws, it will propagate up.
    const getBookmarksFunc = await getBookmarks();
    bookmarks = await getBookmarksFunc(false);
    console.log("[BookmarksServer] Fetched via getBookmarks, count:", bookmarks.length);
    if (bookmarks.length > 0 && bookmarks[0]) {
      console.log("[BookmarksServer] First bookmark title:", bookmarks[0].title);
    } else {
      console.warn(
        "[BookmarksServer] No bookmarks found via getBookmarks (API may have returned empty or fetch was skipped).",
      );
    }

    // Sort bookmarks by date (newest first) if we have any
    bookmarks = bookmarks.length ? sortByDateDesc(bookmarks) : [];

    // Previously, an error was thrown in production if bookmark data was unavailable.
    // This caused a hard failure when the external bookmarks service was unreachable.
    // Instead, log the situation and allow the component tree to render an empty state gracefully.
    if (!propsBookmarks && bookmarks.length === 0) {
      const serverCache = await getServerCache();
      const lastFetched = serverCache.getBookmarks()?.lastFetchedAt ?? 0;
      console.warn("[BookmarksServer] No bookmark data available after fetch. lastFetchedAt=", lastFetched);
      // Proceed with empty array – downstream components will show an empty state UI.
    }
  }

  // Transform to serializable format for client component
  const normalizeFunc = await normalizeBookmarkTag();
  const serializableBookmarks: SerializableBookmark[] = bookmarks.map((bookmark) => ({
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    tags: Array.isArray(bookmark.tags) ? bookmark.tags.map(normalizeFunc) : [],
    dateBookmarked: bookmark.dateBookmarked,
    dateCreated: bookmark.dateCreated,
    dateUpdated: bookmark.dateUpdated,
    content: bookmark.content, // 🎯 CRITICAL: Include content field with Karakeep assets
    logoData: bookmark.logoData
      ? {
          url: bookmark.logoData.url,
          alt: bookmark.logoData.alt || "Logo",
          width: bookmark.logoData.width,
          height: bookmark.logoData.height,
        }
      : null,
    isPrivate: bookmark.isPrivate || false,
    isFavorite: bookmark.isFavorite || false,
    readingTime: bookmark.readingTime,
    wordCount: bookmark.wordCount,
    ogTitle: bookmark.ogTitle,
    ogDescription: bookmark.ogDescription,
    ogImage: bookmark.ogImage,
    domain: bookmark.domain,
  }));

  // Pass the processed data to the client component with explicit typing
  return (
    <BookmarksClientWithWindow
      bookmarks={serializableBookmarks}
      title={title}
      description={description}
      searchAllBookmarks={!propsBookmarks}
      showFilterBar={showFilterBar}
      titleSlug={titleSlug}
      initialPage={initialPage}
      baseUrl={baseUrl}
      usePagination={usePagination}
      initialTag={initialTag}
      tag={tag}
    />
  );
}
