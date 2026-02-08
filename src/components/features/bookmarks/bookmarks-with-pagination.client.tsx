/**
 * Bookmarks Client Component with Pagination
 *
 * Displays a paginated list of bookmarks with configurable search and filtering.
 * Uses the paginated API endpoint to load bookmarks progressively.
 *
 * @module components/features/bookmarks/bookmarks-with-pagination.client
 */

"use client";

import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import { type UnifiedBookmark, type BookmarksWithPaginationClientProps } from "@/types";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { BookmarkRefreshAlerts } from "./bookmark-refresh-alerts.client";
import { BookmarkPaginationNav } from "./bookmark-pagination-nav.client";
import { usePagination } from "@/hooks/use-pagination";
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel.client";
import { useBookmarkRefresh } from "@/hooks/use-bookmark-refresh";

const isDevelopment = process.env.NODE_ENV === "development";
const PRODUCTION_SITE_URL = "https://williamcallahan.com";
const SKELETON_PLACEHOLDER_COUNT = 6;
const IMAGE_PRELOAD_THRESHOLD = 4;

const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] =>
  normalizeTagsToStrings(tags);

export const BookmarksWithPagination: React.FC<BookmarksWithPaginationClientProps> = ({
  initialBookmarks = [],
  showFilterBar = true,
  enableInfiniteScroll = true,
  itemsPerPage = 24,
  initialPage = 1,
  totalPages: initialTotalPages,
  totalCount: initialTotalCount,
  baseUrl = "/bookmarks",
  initialTag,
  tag,
  description,
  className,
  internalHrefs,
}) => {
  const [mounted, setMounted] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  const router = useRouter();
  const pathname = usePathname();

  const {
    items: bookmarks,
    currentPage,
    totalPages,
    totalItems,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    goToPage,
    mutate,
  } = usePagination<UnifiedBookmark>({
    apiUrl: "/api/bookmarks",
    limit: itemsPerPage,
    initialData: initialBookmarks,
    initialPage,
    initialTotalPages,
    initialTotalCount,
    queryParams: tag ? { tag } : {},
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const showRefreshButton = isDevelopment || (siteUrl && siteUrl !== PRODUCTION_SITE_URL);

  const {
    isRefreshing,
    refreshError,
    lastRefreshed,
    showCrossEnvRefresh,
    isRefreshingProduction,
    refreshBookmarks,
    handleProductionRefresh,
    dismissCrossEnvRefresh,
  } = useBookmarkRefresh({
    showRefreshButton: !!showRefreshButton,
    onRefreshSuccess: () => {
      mutate();
      router.refresh();
    },
  });

  useEffect(() => {
    setMounted(true);
    if (initialPage > 1) goToPage(initialPage);
  }, [initialPage, goToPage]);

  const allTags = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    return bookmarks
      .flatMap((bookmark: UnifiedBookmark) => getTagsAsStringArray(bookmark.tags))
      .filter((t, i, self) => t && self.indexOf(t) === i)
      .toSorted((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    if (selectedTag && !tag) {
      return bookmarks.filter((bookmark: UnifiedBookmark) =>
        getTagsAsStringArray(bookmark.tags).includes(selectedTag),
      );
    }
    return bookmarks;
  }, [bookmarks, selectedTag, tag]);

  const handleTagClick = (clickedTag: string) => {
    if (selectedTag === clickedTag) {
      setSelectedTag(null);
      router.push(baseUrl);
    } else {
      setSelectedTag(clickedTag);
      router.push(`/bookmarks/tags/${tagToSlug(clickedTag)}`);
    }
    goToPage(1);
  };

  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [goToPage],
  );

  // Reset to page 1 when tag changes (ref avoids currentPage in deps)
  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (initialPage > 1) return;
    if (selectedTag && currentPageRef.current !== 1) goToPage(1);
  }, [selectedTag, initialPage, goToPage]);

  const useUrlPagination = globalThis.window !== undefined;

  const paginatedSlice = (items: UnifiedBookmark[]): UnifiedBookmark[] => {
    if (enableInfiniteScroll) return items;
    if (items.length <= itemsPerPage) return items;
    return items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  };

  // Sync currentPage with URL navigation from <Link> pagination
  useEffect(() => {
    const match = /\/page\/(\d+)/.exec(pathname);
    const pageFromPath = match ? Number(match[1]) : 1;
    if (!Number.isNaN(pageFromPath) && pageFromPath !== currentPage) {
      goToPage(pageFromPath);
    }
  }, [pathname, goToPage, currentPage]);

  const paginationProps = {
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    isLoading: isLoading || isLoadingMore,
    baseUrl,
    useUrlPagination,
    onPageChange: handlePageChange,
  };

  const resultsCountText = (() => {
    if (error) return "Error loading bookmarks";
    const totalCount = selectedTag ? filteredBookmarks.length : totalItems;
    if (totalCount === 0) return "No bookmarks found";
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalCount);
    return `Showing ${start}-${end} of ${totalCount} bookmarks`;
  })();

  return (
    <div className={`w-full px-4 sm:px-6 lg:px-8 ${className}`}>
      {(description || showRefreshButton) && (
        <div className="flex items-center justify-between gap-4 mb-4">
          {description ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">{description}</p>
          ) : (
            <div />
          )}
          {showRefreshButton && (
            <button
              type="button"
              onClick={() => {
                dismissCrossEnvRefresh();
                void refreshBookmarks();
              }}
              disabled={isRefreshing}
              className="flex-shrink-0 p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Refresh Bookmarks"
              style={{ visibility: mounted ? "visible" : "hidden" }}
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      )}

      <BookmarkRefreshAlerts
        refreshError={refreshError}
        isRefreshing={isRefreshing}
        showCrossEnvRefresh={showCrossEnvRefresh}
        isRefreshingProduction={isRefreshingProduction}
        onProductionRefresh={handleProductionRefresh}
      />

      {showFilterBar && allTags.length > 0 && (
        <div className="mb-6">
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        </div>
      )}

      {mounted && <BookmarkPaginationNav {...paginationProps} className="mb-6" />}

      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-gray-500 dark:text-gray-400">
              {resultsCountText}
              {selectedTag && ` tagged with "${selectedTag}"`}
              {lastRefreshed && (
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  · refreshed {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </p>
            {isDevelopment && (
              <span className="text-xs px-2 py-1 rounded-lg font-mono bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                Page {currentPage}/{totalPages}
              </span>
            )}
          </div>
        ) : (
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" suppressHydrationWarning />
        )}
      </div>

      {!mounted && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {Array.isArray(initialBookmarks) &&
            initialBookmarks
              .slice(0, SKELETON_PLACEHOLDER_COUNT)
              .map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg h-96"
                  suppressHydrationWarning
                />
              ))}
        </div>
      )}
      {mounted && error && (
        <div className="text-center py-16 px-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 text-lg mb-2">Error loading bookmarks</p>
          <p className="text-red-500 dark:text-red-300 text-sm">{error?.message}</p>
        </div>
      )}
      {mounted && !error && filteredBookmarks.length === 0 && (
        <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">No bookmarks found</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {selectedTag ? "Try selecting a different tag." : "No bookmarks available."}
          </p>
        </div>
      )}
      {mounted && !error && filteredBookmarks.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
            {paginatedSlice(filteredBookmarks).map((bookmark, index) => (
              <BookmarkCardClient
                key={bookmark.id}
                {...bookmark}
                internalHref={internalHrefs?.[bookmark.id]}
                preload={index < IMAGE_PRELOAD_THRESHOLD}
              />
            ))}
          </div>

          {enableInfiniteScroll && (
            <InfiniteScrollSentinel
              onIntersect={loadMore}
              loading={isLoadingMore}
              hasMore={hasMore}
            />
          )}
        </>
      )}

      <BookmarkPaginationNav {...paginationProps} className="mt-6 mb-6" />
    </div>
  );
};
