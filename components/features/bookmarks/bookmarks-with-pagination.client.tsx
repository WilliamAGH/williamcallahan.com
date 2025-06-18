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
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark } from "@/types";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { useBookmarksPagination } from "@/hooks/use-bookmarks-pagination";
import { PaginationControl } from "@/components/ui/pagination-control.client";
import { PaginationControlUrl } from "@/components/ui/pagination-control-url.client";
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel.client";

interface BookmarksWithPaginationProps {
  initialBookmarks?: UnifiedBookmark[];
  showFilterBar?: boolean;
  searchAllBookmarks?: boolean;
  enableInfiniteScroll?: boolean;
  itemsPerPage?: number;
  initialPage?: number;
  baseUrl?: string;
  initialTag?: string;
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
  initialPage = 1,
  baseUrl = "/bookmarks",
  initialTag,
}) => {
  // searchAllBookmarks is reserved for future use
  void searchAllBookmarks;
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UnifiedBookmark[] | null>(null);
  const [isSearchingAPI, setIsSearchingAPI] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
    initialData: initialBookmarks,
    initialPage: initialPage
  });

  // Keep the original total count based on the initial server payload. This represents the
  // full size of the dataset **before** any client-side filtering is applied. We need this
  // number to show a stable "total bookmarks" value while users paginate through pages that
  // may not have been fetched yet. (Using `bookmarks.length` would under-count because SWR
  // only stores pages that have already been fetched.)
  const initialTotalCount = initialBookmarks.length;

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

    // If the page was server-rendered with an initial page > 1, instruct the
    // pagination hook to fetch / display that page immediately on the client
    // side. We only run this once on mount.
    if (initialPage > 1) {
      goToPage(initialPage);
    }
  }, [initialPage, goToPage]);

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
      } catch (err: unknown) {
        const searchError = err instanceof Error ? err : new Error(String(err));
        console.warn("Search API failed, falling back to client-side search:", searchError);
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
    if (selectedTag === tag) {
      // Clear filter
      setSelectedTag(null);
      if (goToPage) goToPage(1); // Reset to page 1
    } else {
      // New tag selected
      setSelectedTag(tag);
      if (goToPage) goToPage(1); // Reset to page 1
    }
  };

  // Handle navigation based on tag selection
  useEffect(() => {
    if (!mounted) return;
    
    if (selectedTag && !pathname.includes("/tags/")) {
      // Navigate to tag page when tag is selected
      const tagSlug = tagToSlug(selectedTag);
      router.push(`/bookmarks/tags/${tagSlug}`);
    } else if (!selectedTag && pathname.startsWith("/bookmarks/tags/")) {
      // Navigate back to main bookmarks when tag is cleared
      router.push("/bookmarks");
    }
  }, [selectedTag, pathname, router, mounted]);

  // Navigate to a specific page (used by PaginationControl during SSR fallback)
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
    } catch (err: unknown) {
      const error = err as Error;
      // Only log non-abort errors to avoid noise
      if (error.name !== "AbortError") {
        console.error("Error refreshing bookmarks:", error);
        const message = error.message || "Failed to refresh bookmarks";
        setRefreshError(message);
        setTimeout(() => setRefreshError(null), 5000);
      } else if (error.name === "AbortError") {
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

  // ---------------------------------------------------------------------------
  // UX: Ensure that changing the search query or selected tag always brings the
  // user back to the first page. This prevents scenarios where a user is on
  // page N, applies a filter that returns fewer results than `(N-1)*limit`, and
  // ends up staring at an empty page.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Skip reset if we have an initial page from URL
    if (initialPage && initialPage > 1) {
      return;
    }
    // Reset to page 1 when filters/search change to avoid empty pages.
    if ((searchQuery || selectedTag) && currentPage !== 1) {
      goToPage(1);
    }
    // Note: `goToPage` is a stable callback from `useCallback`, safe to include.
  }, [searchQuery, selectedTag, currentPage, goToPage, initialPage]);

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

      {/* Pagination controls at the top right corner */}
      {mounted && totalPages > 1 && (
        <div className="mb-6 flex justify-end">
          {typeof window !== "undefined" ? (
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

      {/* Results count and info */}
      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {(() => {
                  if (error) {
                    return "Error loading bookmarks";
                  }

                  // When the user is actively searching or filtering by tag, we
                  // fall back to the *filtered* total because the dataset size
                  // genuinely changes from the user's perspective.
                  const isFilteredView = !!searchQuery || !!selectedTag;

                  const totalCount = isFilteredView
                    ? filteredBookmarks.length
                    // Prefer the value returned from the API (includes pages
                    // that haven't been fetched yet); if it's missing, fall
                    // back to the full server payload length.
                    : totalItems || initialTotalCount;

                  if (totalCount === 0) {
                    return "No bookmarks found";
                  }

                  const start = (currentPage - 1) * itemsPerPage + 1;
                  const end = Math.min(currentPage * itemsPerPage, totalCount);

                  return `Showing ${start}-${end} of ${totalCount} bookmarks`;
                })()}
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
                  Page {currentPage}/{totalPages}
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
                {filteredBookmarks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((bookmark) => {
                  // Generate share URL once per bookmark to avoid per-card API calls
                  const shareUrl = `/bookmarks/${generateUniqueSlug(bookmark.url, bookmarks.map(b => ({ id: b.id, url: b.url })), bookmark.id)}`;
                  return <BookmarkCardClient key={bookmark.id} {...bookmark} shareUrl={shareUrl} />;
                })}
              </div>

              {/* Infinite scroll sentinel */}
              {enableInfiniteScroll && (
                <InfiniteScrollSentinel
                  onIntersect={loadMore}
                  loading={isLoadingMore}
                  hasMore={hasMore}
                />
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

      {/* Pagination controls at the bottom */}
      {totalPages > 1 && (
        <div className="mt-6 mb-6 flex justify-end">
          {typeof window !== "undefined" ? (
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