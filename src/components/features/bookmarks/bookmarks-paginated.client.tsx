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
  searchAllBookmarks = false,
  showFilterBar = true,
  usePagination = true,
  enableInfiniteScroll = false,
  itemsPerPage = 24,
  initialPage,
  totalPages,
  totalCount,
  baseUrl,
  initialTag,
  tag,
  description,
  internalHrefs,
}: BookmarksPaginatedClientProps) => {
  // Debug log to check if bookmarks are passed correctly to client component
  if (process.env.NODE_ENV === "development") {
    console.log(
      "BookmarksPaginatedClient receiving bookmarks:",
      bookmarks?.length || 0,
      "searchAllBookmarks:",
      searchAllBookmarks,
      "usePagination:",
      usePagination,
    );
  }

  // Use pagination component if enabled
  if (usePagination) {
    return (
      <BookmarksWithPagination
        bookmarks={bookmarks}
        initialBookmarks={bookmarks}
        showFilterBar={showFilterBar}
        searchAllBookmarks={searchAllBookmarks}
        enableInfiniteScroll={enableInfiniteScroll}
        itemsPerPage={itemsPerPage}
        initialPage={initialPage}
        totalPages={totalPages}
        totalCount={totalCount}
        baseUrl={baseUrl}
        initialTag={initialTag}
        tag={tag}
        description={description}
        internalHrefs={internalHrefs}
      />
    );
  }

  // Otherwise use the original component without client fetch
  return (
    <BookmarksWithOptions
      bookmarks={bookmarks}
      showFilterBar={showFilterBar}
      searchAllBookmarks={searchAllBookmarks}
      initialTag={initialTag}
      description={description}
      internalHrefs={internalHrefs}
    />
  );
};
