/**
 * Bookmarks Client Component with Pagination
 *
 * Displays a paginated list of bookmarks with configurable search and filtering functionality.
 * Uses the paginated API endpoint to load bookmarks progressively.
 *
 * @module components/features/bookmarks/bookmarks-with-pagination.client
 */

"use client";

import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import {
  getErrorMessage,
  type UnifiedBookmark,
  type BookmarksWithPaginationClientProps,
} from "@/types";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControl } from "@/components/ui/pagination-control.client";
import { PaginationControlUrl } from "@/components/ui/pagination-control-url.client";
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel.client";

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === "development";

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithPagination: React.FC<BookmarksWithPaginationClientProps> = ({
  initialBookmarks = [],
  showFilterBar = true,
  searchAllBookmarks: _searchAllBookmarks = false,
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
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [showCrossEnvRefresh, setShowCrossEnvRefresh] = useState(false);
  const [isRefreshingProduction, setIsRefreshingProduction] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Infinite scroll is active when enabled (search handled via sitewide terminal)
  const infiniteScrollActive = enableInfiniteScroll;

  // The hook now expects UnifiedBookmark[] directly, not wrapped in pagination structure
  const paginatedInitialData = initialBookmarks;

  // Use the generic pagination hook
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
    initialData: paginatedInitialData,
    initialPage: initialPage,
    initialTotalPages,
    initialTotalCount,
    queryParams: tag ? { tag } : {},
  });

  // Determine if refresh button should be shown
  // Show refresh button for non-production environments (development, test, staging)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const isDev = process.env.NODE_ENV === "development";

  // Show refresh button if:
  // 1. We're in development mode (NODE_ENV=development), OR
  // 2. NEXT_PUBLIC_SITE_URL is not the production URL (https://williamcallahan.com)
  const showRefreshButton = isDev || (siteUrl && siteUrl !== "https://williamcallahan.com");

  // Set mounted state once after hydration
  useEffect(() => {
    setMounted(true);

    // If the page was server-rendered with an initial page > 1, instruct the
    // pagination hook to fetch / display that page immediately on the client
    // side. We only run this once on mount.
    if (initialPage > 1) {
      goToPage(initialPage);
    }
  }, [initialPage, goToPage]);

  // Extract all unique tags from loaded bookmarks
  const allTags = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    return bookmarks
      .flatMap((bookmark: UnifiedBookmark) => getTagsAsStringArray(bookmark.tags))
      .filter((tag, index, self) => tag && self.indexOf(tag) === index)
      .toSorted((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  // Filter bookmarks based on tags only (search handled via sitewide terminal)
  const filteredBookmarks = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];

    // Skip tag filtering if we're on a tag-specific page (server already filtered)
    // Only apply client-side tag filtering when user selects a different tag
    if (selectedTag && !tag) {
      return bookmarks.filter((bookmark: UnifiedBookmark) => {
        const tagsAsString = getTagsAsStringArray(bookmark.tags);
        return tagsAsString.includes(selectedTag);
      });
    }

    return bookmarks;
  }, [bookmarks, selectedTag, tag]);

  const handleTagClick = (clickedTag: string) => {
    if (selectedTag === clickedTag) {
      // Clear filter
      setSelectedTag(null);
      router.push(baseUrl);
    } else {
      // New tag selected
      setSelectedTag(clickedTag);
      // Navigate to the canonical tag URL (avoids nesting `/tags/.../tags/...`).
      router.push(`/bookmarks/tags/${tagToSlug(clickedTag)}`);
    }
    if (goToPage) goToPage(1); // Reset to page 1
  };

  // Navigate to a specific page (used by PaginationControl)
  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [goToPage],
  );

  // Function to refresh bookmarks data
  const refreshBookmarks = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }, 15000);

    try {
      // Call the refresh API endpoint
      const response = await fetch("/api/bookmarks/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as import("@/types").RefreshResult;
      console.log("Bookmarks refresh result:", result);

      // If refresh was successful, mutate to refetch data
      if (result.status === "success") {
        mutate();
        setLastRefreshed(new Date());
        // Show cross-environment refresh option for non-production
        if (showRefreshButton && !isRefreshingProduction) {
          setShowCrossEnvRefresh(true);
        }
        router.refresh();
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        // Only log non-abort errors to avoid noise
        if (err.name !== "AbortError") {
          console.error("Error refreshing bookmarks:", err);
          const message = err.message || "Failed to refresh bookmarks";
          setRefreshError(message);
          setTimeout(() => setRefreshError(null), 5000);
        } else if (err.name === "AbortError") {
          console.log("Bookmark refresh was aborted (likely due to timeout)");
          setRefreshError("Request timed out. Please try again.");
          setTimeout(() => setRefreshError(null), 5000);
        }
      } else {
        console.error("An unknown error occurred during refresh:", err);
        setRefreshError("An unexpected error occurred.");
      }
    } finally {
      setIsRefreshing(false);
      // Ensure timeout is always cleared
      clearTimeout(timeoutId);
    }
  }, [mutate, router, showRefreshButton, isRefreshingProduction]);

  // Handler for refreshing production environment bookmarks
  const handleProductionRefresh = async () => {
    setIsRefreshingProduction(true);
    setShowCrossEnvRefresh(false);

    try {
      console.log("[Bookmarks] Requesting production bookmarks refresh");
      // Call a special endpoint that will trigger production refresh
      const response = await fetch("/api/bookmarks/refresh-production", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        console.log("[Bookmarks] Production refresh initiated successfully");
      } else {
        const errorData: unknown = await response.json().catch(() => null);
        const errorMessage = getErrorMessage(errorData) || response.statusText;
        console.error("[Bookmarks] Production refresh failed:", errorMessage);
        setRefreshError(`Production refresh failed: ${errorMessage}`);
        setTimeout(() => setRefreshError(null), 5000);
      }
    } catch (error) {
      console.error("[Bookmarks] Failed to trigger production refresh:", error);
      setRefreshError("Failed to trigger production refresh");
      setTimeout(() => setRefreshError(null), 5000);
    } finally {
      setIsRefreshingProduction(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset to page 1 whenever selected tag changes.
  // We keep `currentPage` out of the dependency list by reading it from a ref,
  // satisfying the exhaustive-deps rule without importing experimental APIs.
  // ---------------------------------------------------------------------------

  const currentPageRef = useRef(currentPage);

  // Keep the ref in sync with the latest page number
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    // Skip SSR deep-link when the initial page is >1
    if (initialPage && initialPage > 1) return;

    if (selectedTag && currentPageRef.current !== 1) {
      goToPage(1);
    }
  }, [selectedTag, initialPage, goToPage]);

  // Display bookmarks from the filtered list
  const displayBookmarks = filteredBookmarks;

  // Use URL-based pagination (search handled via sitewide terminal)
  const useUrlPagination = globalThis.window !== undefined;

  // Client-side safe slicer (applies to ANY view when we have more than one
  // page worth of items). This guarantees tag-search views correctly slice
  // irrespective of the `tag` prop coming from SSR.
  const paginatedSlice = (items: UnifiedBookmark[]): UnifiedBookmark[] => {
    if (infiniteScrollActive) return items; // avoid slicing for infinite scroll when active
    if (items.length <= itemsPerPage) return items;
    return items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  };

  // ---------------------------------------------------------------------------
  // Keep `currentPage` in sync with URL navigation triggered by <Link> (i.e.,
  // PaginationControlUrl).  This provides immediate visual feedback instead
  // of waiting for the server round-trip.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const match = new RegExp(/\/page\/(\d+)/).exec(pathname);
    const pageFromPath = match ? Number(match[1]) : 1;
    if (!Number.isNaN(pageFromPath) && pageFromPath !== currentPage) {
      goToPage(pageFromPath);
    }
    // `goToPage` is a stable callback from the pagination hook – safe omit.
  }, [pathname, goToPage, currentPage]);

  // Dev-only hydration guard - only runs in development
  useEffect(() => {
    if (!isDevelopment || !mounted) return;

    const win = globalThis as unknown as Record<string, unknown>;
    if (win.hydrationRefreshBtn !== undefined && win.hydrationRefreshBtn !== showRefreshButton) {
      console.error("[HydrationCheck] showRefreshButton mismatch between SSR and client");
    }
    win.hydrationRefreshBtn = showRefreshButton;
  }, [mounted, showRefreshButton]);

  return (
    <div className={`w-full px-4 sm:px-6 lg:px-8 ${className}`}>
      {/* Description row with refresh button */}
      {(description || showRefreshButton) && (
        <div className="flex items-center justify-between gap-4 mb-4">
          {description && <p className="text-gray-500 dark:text-gray-400 text-sm">{description}</p>}
          {!description && <div />}
          {showRefreshButton && (
            <button
              type="button"
              onClick={() => {
                setShowCrossEnvRefresh(false);
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

      {/* Dev-only alerts - stacked when present */}
      {(refreshError || showCrossEnvRefresh) && (
        <div className="mb-4 space-y-3">
          {/* Refresh error */}
          {refreshError && !isRefreshing && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {refreshError}
            </div>
          )}

          {/* Cross-environment refresh banner */}
          {showCrossEnvRefresh && !isRefreshing && (
            <div className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2.5 sm:p-3 rounded-lg border border-blue-200/50 dark:border-blue-800/30 shadow-sm">
              {isRefreshingProduction ? (
                <span className="flex items-center justify-center sm:justify-start">
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin mr-2 flex-shrink-0" />
                  <span className="leading-relaxed">Triggering production refresh...</span>
                </span>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-0">
                  <span className="block sm:inline leading-relaxed">Local refresh completed.</span>
                  <span className="block sm:inline sm:ml-1.5">
                    Would you like to{" "}
                    <button
                      type="button"
                      onClick={handleProductionRefresh}
                      className="inline-flex items-center gap-1 underline decoration-1 underline-offset-2 hover:text-blue-800 dark:hover:text-blue-200 font-semibold transition-colors touch-manipulation"
                      disabled={isRefreshingProduction}
                    >
                      refresh production <span className="hidden sm:inline">environment</span>
                      <span className="inline sm:hidden">too</span>
                    </button>
                    {"?"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tags row */}
      {showFilterBar && allTags.length > 0 && (
        <div className="mb-6">
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        </div>
      )}

      {/* Pagination controls at the top right corner */}
      {mounted && totalPages > 1 && (
        <div className="mb-6 flex justify-end">
          {useUrlPagination ? (
            <PaginationControlUrl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              isLoading={isLoading || isLoadingMore}
              baseUrl={baseUrl}
            />
          ) : (
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              isLoading={isLoading || isLoadingMore}
              showPageInfo={false}
            />
          )}
        </div>
      )}

      {/* Results count */}
      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-gray-500 dark:text-gray-400">
              {(() => {
                if (error) {
                  return "Error loading bookmarks";
                }

                // When the user is filtering by tag, we use the filtered total
                const isFilteredView = !!selectedTag;

                const totalCount = isFilteredView
                  ? (displayBookmarks?.length ?? 0)
                  : (totalItems ?? initialTotalCount);

                if (totalCount === 0) {
                  return "No bookmarks found";
                }

                const start = (currentPage - 1) * itemsPerPage + 1;
                const end = Math.min(currentPage * itemsPerPage, totalCount);

                return `Showing ${start}-${end} of ${totalCount} bookmarks`;
              })()}
              {selectedTag && ` tagged with "${selectedTag}"`}
              {lastRefreshed && (
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  · refreshed {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </p>

            {/* Debug indicator - only show in development mode */}
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

      {/* Client-side only rendering of bookmark results */}
      {!mounted && (
        /* Server-side placeholder with hydration suppression */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {Array.isArray(initialBookmarks) &&
            initialBookmarks
              .slice(0, 6)
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
      {mounted && !error && (displayBookmarks?.length ?? 0) === 0 && (
        <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">No bookmarks found</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {selectedTag ? "Try selecting a different tag." : "No bookmarks available."}
          </p>
        </div>
      )}
      {mounted && !error && (displayBookmarks?.length ?? 0) > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
            {Array.isArray(displayBookmarks) &&
              paginatedSlice(displayBookmarks).map((bookmark, index) => {
                // Debug: Log bookmark data for CLI bookmark
                if (bookmark.id === "yz7g8v8vzprsd2bm1w1cjc4y") {
                  console.log("[BookmarksWithPagination] CLI bookmark data:", {
                    id: bookmark.id,
                    hasContent: !!bookmark.content,
                    hasImageAssetId: !!bookmark.content?.imageAssetId,
                    hasImageUrl: !!bookmark.content?.imageUrl,
                    hasScreenshotAssetId: !!bookmark.content?.screenshotAssetId,
                    content: bookmark.content,
                  });
                }
                return (
                  <BookmarkCardClient
                    key={bookmark.id}
                    {...bookmark}
                    internalHref={internalHrefs?.[bookmark.id]}
                    preload={index < 4}
                  />
                );
              })}
          </div>

          {/* Infinite scroll sentinel */}
          {infiniteScrollActive && (
            <InfiniteScrollSentinel
              onIntersect={loadMore}
              loading={isLoadingMore}
              hasMore={hasMore}
            />
          )}
        </>
      )}

      {/* Pagination controls at the bottom */}
      {totalPages > 1 && (
        <div className="mt-6 mb-6 flex justify-end">
          {useUrlPagination ? (
            <PaginationControlUrl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              isLoading={isLoading || isLoadingMore}
              baseUrl={baseUrl}
            />
          ) : (
            <PaginationControl
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
              isLoading={isLoading || isLoadingMore}
              showPageInfo={false}
            />
          )}
        </div>
      )}
    </div>
  );
};
