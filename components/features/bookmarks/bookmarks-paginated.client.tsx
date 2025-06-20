/**
 * Bookmarks Paginated Client Component
 *
 * Wrapper component that decides whether to use pagination or the original component
 *
 * @module components/features/bookmarks/bookmarks-paginated.client
 */
"use client";

import type { BookmarksPaginatedClientProps } from "@/types";
import { BookmarksWithOptions } from "./bookmarks-with-options.client";
import { BookmarksWithPagination } from "./bookmarks-with-pagination.client";

export const BookmarksPaginatedClient: React.FC<BookmarksPaginatedClientProps> = ({
  bookmarks,
  forceClientFetch = false,
  showFilterBar = true,
  usePagination = true,
  enableInfiniteScroll = true,
  itemsPerPage = 24,
  initialPage,
  baseUrl,
  initialTag,
  tag,
}) => {
  // Debug log to check if bookmarks are passed correctly to client component
  if (process.env.NODE_ENV === "development") {
    console.log(
      "BookmarksPaginatedClient receiving bookmarks:",
      bookmarks?.length || 0,
      "forceClientFetch:",
      forceClientFetch,
      "usePagination:",
      usePagination,
    );
  }

  // Use pagination component if enabled
  if (usePagination) {
    return (
      <BookmarksWithPagination
        initialBookmarks={bookmarks}
        showFilterBar={showFilterBar}
        searchAllBookmarks={forceClientFetch}
        enableInfiniteScroll={enableInfiniteScroll}
        itemsPerPage={itemsPerPage}
        initialPage={initialPage}
        baseUrl={baseUrl}
        initialTag={initialTag}
        tag={tag}
      />
    );
  }

  // Otherwise use the original component without client fetch
  return (
    <BookmarksWithOptions
      bookmarks={bookmarks}
      showFilterBar={showFilterBar}
      searchAllBookmarks={false} // Disable client fetch when pagination is disabled
      initialTag={initialTag}
    />
  );
};
