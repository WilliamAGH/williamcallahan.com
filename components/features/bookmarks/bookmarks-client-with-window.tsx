"use client";

/**
 * Bookmarks Client With Window Component
 *
 * Handles displaying bookmarks within a window UI
 * This is the main entry point for the bookmarks feature that applies the window UI
 *
 * @module components/features/bookmarks/bookmarks-client-with-window
 */

import type { UnifiedBookmark } from "@/types";
import { Suspense } from "react";
import { BookmarksWindow } from "./bookmarks-window.client";
// Alias BookmarksPaginatedClient as BookmarksClient for backwards compatibility with tests and type checks
import { BookmarksPaginatedClient as BookmarksClient } from "./bookmarks-paginated.client";

// Loading state when bookmarks are fetching
function BookmarksLoading() {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      <div className="mb-6 space-y-5">
        <div className="w-full h-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-20 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="rounded-xl overflow-hidden">
            <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700 animate-pulse" />
            <div className="p-5 space-y-4 bg-white dark:bg-gray-800">
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
              <div className="h-6 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="space-y-2">
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
              <div className="pt-4 flex gap-1.5">
                {[1, 2, 3].map((j) => (
                  <div
                    key={j}
                    className="h-5 w-16 rounded-md bg-gray-200 dark:bg-gray-700 animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BookmarksClientWithWindowProps {
  bookmarks: UnifiedBookmark[];
  title: string;
  description: string;
  forceClientFetch?: boolean;
  showFilterBar?: boolean;
  titleSlug?: string;
}

export function BookmarksClientWithWindow({
  bookmarks,
  title,
  description,
  forceClientFetch = false,
  showFilterBar = true,
  titleSlug,
}: BookmarksClientWithWindowProps) {
  return (
    <BookmarksWindow
      titleSlug={titleSlug}
      windowTitle={title} // Pass the title to be used as window title
    >
      <div className="w-full mx-auto py-8">
        {/* Only show description if provided */}
        {description && (
          <div className="px-4 sm:px-6 lg:px-8 mb-4">
            <p className="text-gray-600 dark:text-gray-300">{description}</p>
          </div>
        )}
        <Suspense fallback={<BookmarksLoading />}>
          <BookmarksClient
            bookmarks={bookmarks}
            forceClientFetch={forceClientFetch}
            showFilterBar={showFilterBar}
            usePagination={true}
            enableInfiniteScroll={false}
            itemsPerPage={24}
          />
        </Suspense>
      </div>
    </BookmarksWindow>
  );
}
