/**
 * Bookmarks Client Component with Pagination
 *
 * Displays a paginated list of bookmarks with configurable search and filtering functionality.
 * Uses the paginated API endpoint to load bookmarks progressively.
 *
 * @module components/features/bookmarks/bookmarks-with-pagination.client
 */
"use client";

import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import type { UnifiedBookmark } from "@/types";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { useBookmarksPagination } from "@/hooks/use-bookmarks-pagination";
import { PaginationControl } from "@/components/ui/pagination-control.client";
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel.client";

interface BookmarksWithPaginationProps {
  initialBookmarks?: UnifiedBookmark[];
  showFilterBar?: boolean;
  searchAllBookmarks?: boolean;
  enableInfiniteScroll?: boolean;
  itemsPerPage?: number;
}

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === "development";

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithPagination: React.FC<BookmarksWithPaginationProps> = ({
  initialBookmarks = [],
  showFilterBar = true,
  searchAllBookmarks = false,
  enableInfiniteScroll = true,
  itemsPerPage = 24,
}) => {
  // searchAllBookmarks is reserved for future use
  void searchAllBookmarks;
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UnifiedBookmark[] | null>(null);
  const [isSearchingAPI, setIsSearchingAPI] = useState(false);
  const router = useRouter();

  // Use the pagination hook
  const {
    bookmarks,
    currentPage,
    totalPages,
    totalItems,
    isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    goToPage,
    mutate
  } = useBookmarksPagination({
    limit: itemsPerPage,
    initialData: initialBookmarks
  });

  // Determine if refresh button should be shown
  const coolifyUrl = process.env.NEXT_PUBLIC_COOLIFY_URL;
  const targetUrl = "https://williamcallahan.com";
  let showRefreshButton = true; // Default to true
  if (coolifyUrl) {
    const normalizedCoolifyUrl = coolifyUrl.endsWith("/") ? coolifyUrl.slice(0, -1) : coolifyUrl;
    const normalizedTargetUrl = targetUrl.endsWith("/") ? targetUrl.slice(0, -1) : targetUrl;
    if (normalizedCoolifyUrl === normalizedTargetUrl) {
      showRefreshButton = false;
    }
  }

  // Set mounted state once after hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Call search API when search query changes
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setSearchResults(null);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      try {
        setIsSearchingAPI(true);
        const response = await fetch(`/api/search/all?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const results = await response.json() as Array<{ label: string; description: string; path: string }>;
          // Filter only bookmark results and map back to UnifiedBookmark format
          const bookmarkResults = results
            .filter(r => r.path.startsWith('/bookmarks/'))
            .map(r => {
              // Find the matching bookmark from our current set
              const matchingBookmark = bookmarks.find(b => 
                r.label === b.title || r.path.includes(b.id)
              );
              return matchingBookmark;
            })
            .filter((b): b is UnifiedBookmark => b !== undefined);
          
          setSearchResults(bookmarkResults);
        } else {
          // API failed, fall back to client-side search
          setSearchResults(null);
        }
      } catch (error) {
        console.warn('Search API failed, falling back to client-side search:', error);
        setSearchResults(null);
      } finally {
        setIsSearchingAPI(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(searchTimeout);
  }, [searchQuery, bookmarks]);

  // Extract all unique tags from loaded bookmarks
  const allTags = useMemo(() => {
    return bookmarks
      .flatMap((bookmark) => getTagsAsStringArray(bookmark.tags))
      .filter((tag, index, self) => tag && self.indexOf(tag) === index)
      .sort();
  }, [bookmarks]);

  // Filter bookmarks based on search and tags
  const filteredBookmarks = useMemo(() => {
    // If we have search results from the API, use those
    if (searchResults && searchQuery) {
      // Apply tag filter to API results
      if (selectedTag) {
        return searchResults.filter((bookmark) => {
          const tagsAsString = getTagsAsStringArray(bookmark.tags);
          return tagsAsString.includes(selectedTag);
        });
      }
      return searchResults;
    }

    // Otherwise, use client-side filtering on loaded bookmarks
    return bookmarks.filter((bookmark) => {
      const tagsAsString = getTagsAsStringArray(bookmark.tags);

      // Filter by selected tag if any
      if (selectedTag && !tagsAsString.includes(selectedTag)) {
        return false;
      }

      // If no search query, just return tag-filtered results
      const searchTerms = searchQuery
        .toLowerCase()
        .split(" ")
        .filter((term) => term.length > 0);
      if (searchTerms.length === 0) return true;

      // Combine relevant text fields for searching
      const bookmarkText = [
        bookmark.title,
        bookmark.description,
        tagsAsString.join(" "),
        bookmark.url,
        bookmark.content?.author,
        bookmark.content?.publisher,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      // Check if all search terms are included in the bookmark text
      return searchTerms.every((term) => bookmarkText.includes(term));
    });
  }, [bookmarks, searchQuery, selectedTag, searchResults]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // The search happens automatically as the query is typed
  };

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

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
        interface ErrorResponse {
          error: string | null;
        }
        const errorData = (await response
          .json()
          .catch(() => ({ error: null }) as ErrorResponse)) as ErrorResponse;
        const errorMessage = errorData.error || `Refresh failed: ${response.status}`;
        throw new Error(errorMessage);
      }

      interface RefreshResult {
        status: string;
        message?: string;
      }

      const result = (await response.json()) as RefreshResult;
      console.log("Bookmarks refresh result:", result);

      // If refresh was successful, mutate to refetch data
      if (result.status === "success") {
        mutate();
        setLastRefreshed(new Date());
        router.refresh();
      }
    } catch (error) {
      // Only log non-abort errors to avoid noise
      if (error instanceof Error && error.name !== "AbortError") {
        console.error("Error refreshing bookmarks:", error);
        const message = error.message || "Failed to refresh bookmarks";
        setRefreshError(message);
        setTimeout(() => setRefreshError(null), 5000);
      } else if (error instanceof Error && error.name === "AbortError") {
        console.log("Bookmark refresh was aborted (likely due to timeout)");
        setRefreshError("Request timed out. Please try again.");
        setTimeout(() => setRefreshError(null), 5000);
      }
    } finally {
      setIsRefreshing(false);
      // Ensure timeout is always cleared
      clearTimeout(timeoutId);
    }
  }, [mutate, router]);

  // Handle page change
  const handlePageChange = useCallback((page: number) => {
    goToPage(page);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [goToPage]);

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      {/* Search and filtering */}
      <div className="mb-6 space-y-5">
        <div className="flex items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 mr-2">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {isSearchingAPI ? (
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              ) : (
                <Search className="h-5 w-5 text-gray-400" />
              )}
            </div>
            {mounted ? (
              <>
                <input
                  type="text"
                  placeholder="Search bookmarks by title, description, URL, author..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="block w-full pl-10 pr-12 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                <button
                  type="submit"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Submit search"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </>
            ) : (
              <div
                className="block w-full pl-10 pr-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 h-12"
                suppressHydrationWarning
              />
            )}
          </form>

          {/* Refresh button - conditionally rendered */}
          {mounted && showRefreshButton && (
            <button
              type="button"
              onClick={refreshBookmarks}
              disabled={isRefreshing}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Refresh Bookmarks"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
            </button>
          )}
          {/* Display Refresh Error */}
          {refreshError && (
            <div className="mt-2 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {refreshError}
            </div>
          )}
        </div>

        {/* Tags filter - only show if showFilterBar is true */}
        {showFilterBar && allTags.length > 0 && (
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        )}
      </div>

      {/* Pagination controls at the top */}
      {mounted && !enableInfiniteScroll && totalPages > 1 && (
        <div className="mb-6 flex justify-end">
          <PaginationControl
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            isLoading={isLoading || isLoadingMore}
            showPageInfo={false}
          />
        </div>
      )}

      {/* Results count and info */}
      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {error ? (
                  "Error loading bookmarks"
                ) : filteredBookmarks.length === 0 ? (
                  "No bookmarks found"
                ) : enableInfiniteScroll ? (
                  `Showing ${filteredBookmarks.length} of ${totalItems} bookmarks`
                ) : (
                  `Showing ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, filteredBookmarks.length)} of ${filteredBookmarks.length} bookmarks`
                )}
                {searchQuery && ` for "${searchQuery}"`}
                {selectedTag && ` tagged with "${selectedTag}"`}
              </p>

              {/* Last refreshed timestamp */}
              {lastRefreshed && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Last refreshed: {lastRefreshed.toLocaleString()}
                </p>
              )}
            </div>

            {/* Debug indicator - only show in development mode */}
            {isDevelopment && (
              <div className="mt-2 sm:mt-0 text-xs inline-flex items-center">
                <span className="px-2 py-1 rounded-lg font-mono bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {enableInfiniteScroll ? 'Infinite Scroll' : `Page ${currentPage}/${totalPages}`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" suppressHydrationWarning />
        )}
      </div>

      {/* Client-side only rendering of bookmark results */}
      {mounted ? (
        <>
          {error ? (
            <div className="text-center py-16 px-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-red-600 dark:text-red-400 text-lg mb-2">
                Error loading bookmarks
              </p>
              <p className="text-red-500 dark:text-red-300 text-sm">
                {error.message}
              </p>
            </div>
          ) : filteredBookmarks.length === 0 && searchQuery ? (
            <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
                No bookmarks found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Try adjusting your search terms or filters.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
                {(enableInfiniteScroll ? filteredBookmarks : filteredBookmarks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)).map((bookmark) => (
                  <BookmarkCardClient key={bookmark.id} {...bookmark} />
                ))}
              </div>

              {/* Infinite scroll sentinel */}
              {enableInfiniteScroll && (
                <InfiniteScrollSentinel
                  onIntersect={loadMore}
                  loading={isLoadingMore}
                  hasMore={hasMore && filteredBookmarks.length < totalItems}
                />
              )}

              {/* Pagination controls at the bottom */}
              {!enableInfiniteScroll && totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                  <PaginationControl
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    onPageChange={handlePageChange}
                    isLoading={isLoading || isLoadingMore}
                  />
                </div>
              )}
            </>
          )}
        </>
      ) : (
        /* Server-side placeholder with hydration suppression */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {initialBookmarks.slice(0, 6).map((bookmark) => (
            <div
              key={bookmark.id}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg h-96"
              suppressHydrationWarning
            />
          ))}
        </div>
      )}
    </div>
  );
};