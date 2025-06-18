/**
 * Bookmarks Server Component
 * @module components/features/bookmarks/bookmarks.server
 * @description
 * Server component that fetches bookmarks data and passes it to the client component.
 */
import "server-only"; // Ensure this component remains server-only

import { getBookmarks } from "@/lib/data-access/bookmarks";
import { ServerCacheInstance } from "@/lib/server-cache";
import type { UnifiedBookmark } from "@/types";
import { BookmarksClientWithWindow } from "./bookmarks-client-with-window";

import type { JSX } from "react";

interface BookmarksServerProps {
  title: string;
  description: string;
  bookmarks?: UnifiedBookmark[];
  showFilterBar?: boolean;
  titleSlug?: string;
  initialPage?: number;
  baseUrl?: string;
  usePagination?: boolean;
  initialTag?: string;
}

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
}: BookmarksServerProps): Promise<JSX.Element> {
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

  if (propsBookmarks) {
    // Apply the same consistent sorting even when bookmarks are provided externally
    bookmarks = sortByDateDesc(propsBookmarks);
    console.log("[BookmarksServer] Using provided bookmarks, count:", bookmarks.length);
  } else {
    // Fetch bookmarks. If getBookmarks() throws, it will propagate up.
    bookmarks = await getBookmarks(false);
    console.log("[BookmarksServer] Fetched via getBookmarks, count:", bookmarks.length);
    if (bookmarks.length > 0) {
      console.log("[BookmarksServer] First bookmark title:", bookmarks[0]?.title);
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
      const lastFetched = ServerCacheInstance.getBookmarks()?.lastFetchedAt ?? 0;
      console.warn(
        "[BookmarksServer] No bookmark data available after fetch. lastFetchedAt=",
        lastFetched,
      );
      // Proceed with empty array – downstream components will show an empty state UI.
    }
  }

  const initialBookmarks = propsBookmarks || bookmarks;

  // Pass the processed data to the client component
  return (
    <BookmarksClientWithWindow
      bookmarks={initialBookmarks}
      title={title}
      description={description}
      forceClientFetch={!propsBookmarks}
      showFilterBar={showFilterBar}
      titleSlug={titleSlug}
      initialPage={initialPage}
      baseUrl={baseUrl}
      usePagination={usePagination}
      initialTag={initialTag}
    />
  );
}
