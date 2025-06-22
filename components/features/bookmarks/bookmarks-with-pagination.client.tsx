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

import type { BookmarksWithPaginationClientProps, UseBookmarksPaginationReturn } from "@/types";

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === "development";

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithPagination: React.FC<BookmarksWithPaginationClientProps> = ({
  initialBookmarks = [],
  showFilterBar = true,
  searchAllBookmarks = false,
  enableInfiniteScroll = true,
  itemsPerPage = 24,
  initialPage = 1,
  baseUrl = "/bookmarks",
  initialTag,
  tag,
  className,
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

  // The hook now expects UnifiedBookmark[] directly, not wrapped in pagination structure
  const paginatedInitialData = initialBookmarks;

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
    mutate,
  }: UseBookmarksPaginationReturn = useBookmarksPagination({
    limit: itemsPerPage,
    initialData: paginatedInitialData,
    initialPage: initialPage,
    tag: tag, // Pass tag for server-side filtering
  });

  // Keep the original total count based on the initial server payload. This represents the
  // full size of the dataset **before** any client-side filtering is applied. We need this
  // number to show a stable "total bookmarks" value while users paginate through pages that
  // may not have been fetched yet. (Using `bookmarks.length` would under-count because SWR
  // only stores pages that have already been fetched.)
  const initialTotalCount = initialBookmarks?.length ?? 0;

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

  // Search across the ENTIRE bookmark collection (server-side fetch) whenever
  // the query changes. This guarantees we are not restricted to the currently
  // loaded page or any active tag filter. We debounce the request for 300 ms.
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length === 0) {
      setSearchResults(null);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      try {
        setIsSearchingAPI(true);

        // Fetch *all* bookmarks in one shot (up to 1000, well above current
        // collection size) so we can filter entirely client-side.
        const response = await fetch("/api/bookmarks?limit=1000&page=1", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json: unknown = await response.json();
        
        // The API returns { data: [...], meta: {...} } format
        const apiResponse = json as { data: UnifiedBookmark[]; meta: unknown };
        
        // API already returns UnifiedBookmark objects, no validation needed
        const allBookmarks: UnifiedBookmark[] = apiResponse.data;

        // Simple client-side filtering (case-insensitive contains across key
        // fields). We reuse the same helper used in the memoized filter below
        // so behaviour stays consistent.
        const terms = searchQuery
          .toLowerCase()
          .split(" ")
          .filter((t) => t.length > 0);

        const matches = allBookmarks.filter((b: UnifiedBookmark) => {
          if (terms.length === 0) return true;

          const tagsAsString = getTagsAsStringArray(b.tags);

          const haystack = [
            b.title,
            b.description,
            tagsAsString.join(" "),
            b.url,
            b.content?.author,
            b.content?.publisher,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return terms.every((term) => haystack.includes(term));
        });

        setSearchResults(matches);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "An unknown error occurred during search.";
        console.warn("Full-dataset bookmark search failed, falling back to local filter", message);
        setSearchResults(null);
      } finally {
        setIsSearchingAPI(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  // Extract all unique tags from loaded bookmarks
  const allTags = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    return bookmarks
      .flatMap((bookmark: UnifiedBookmark) => getTagsAsStringArray(bookmark.tags))
      .filter((tag, index, self) => tag && self.indexOf(tag) === index)
      .sort();
  }, [bookmarks]);

  // Filter bookmarks based on search and tags
  const filteredBookmarks = useMemo(() => {
    // If we have search results from the API, use those
    if (searchResults && searchQuery) {
      // Apply tag filter to API results
      if (selectedTag) {
        return searchResults.filter((bookmark: UnifiedBookmark) => {
          const tagsAsString = getTagsAsStringArray(bookmark.tags);
          return tagsAsString.includes(selectedTag);
        });
      }
      return searchResults;
    }

    if (!Array.isArray(bookmarks)) return [];
    // Otherwise, use client-side filtering on loaded bookmarks
    return bookmarks.filter((bookmark: UnifiedBookmark) => {
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
    // Clear any active tag filter when the user starts a text search so that
    // search results are drawn from the full dataset.
    if (selectedTag) {
      setSelectedTag(null);
      if (goToPage) goToPage(1);
    }
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

  // Navigate to the correct URL when the selected tag changes. This covers
  // three scenarios:
  // 1. We are on /bookmarks and a tag is selected → push to /bookmarks/tags/<tag>.
  // 2. We are already on a different tag page and select a new tag → replace the slug.
  // 3. The tag filter is cleared while on /bookmarks/tags/<tag> → return to /bookmarks.
  useEffect(() => {
    if (!mounted) return;

    // Extract the current tag slug from the pathname, if any
    const match = pathname.match(/\/bookmarks\/tags\/([^/]+)/);
    const currentTagSlug = match ? match[1] : null;

    const nextTagSlug = selectedTag ? tagToSlug(selectedTag) : null;

    if (nextTagSlug && nextTagSlug !== currentTagSlug) {
      router.push(`/bookmarks/tags/${nextTagSlug}`);
    } else if (!nextTagSlug && currentTagSlug) {
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
        throw new Error(`HTTP ${response.status}`);
      }

      const result = (await response.json()) as import("@/types").RefreshResult;
      console.log("Bookmarks refresh result:", result);

      // If refresh was successful, mutate to refetch data
      if (result.status === "success") {
        mutate();
        setLastRefreshed(new Date());
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

  const displayBookmarks = useMemo(() => {
    if (searchResults) return searchResults;
    return filteredBookmarks;
  }, [searchResults, filteredBookmarks]);

  const shareUrls = useMemo(() => {
    const urls = new Map<string, string>();
    if (Array.isArray(displayBookmarks)) {
      displayBookmarks.forEach((bookmark: UnifiedBookmark) => {
        urls.set(
          bookmark.id,
          `/bookmarks/${generateUniqueSlug(
            bookmark.url,
            Array.isArray(bookmarks) ? bookmarks.map((b: UnifiedBookmark) => ({ id: b.id, url: b.url })) : [],
            bookmark.id,
          )}`,
        );
      });
    }
    return urls;
  }, [displayBookmarks, bookmarks]);

  return (
    <div className={`w-full px-4 sm:px-6 lg:px-8 ${className}`}>
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
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
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
                    ? (displayBookmarks?.length ?? 0)
                    : // Prefer the value returned from the API (includes pages
                      // that haven't been fetched yet); if it's missing, fall
                      // back to the full server payload length.
                      (totalItems ?? initialTotalCount);

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
        error ? (
          <div className="text-center py-16 px-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-red-600 dark:text-red-400 text-lg mb-2">Error loading bookmarks</p>
            <p className="text-red-500 dark:text-red-300 text-sm">{error?.message}</p>
          </div>
        ) : (displayBookmarks?.length ?? 0) === 0 && searchQuery ? (
          <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
              No bookmarks found for &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your search terms or filters.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
              {Array.isArray(displayBookmarks) &&
                displayBookmarks
                  .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                  .map((bookmark: UnifiedBookmark) => {
                    // Debug: Log bookmark data for CLI bookmark
                    if (bookmark.id === 'yz7g8v8vzprsd2bm1w1cjc4y') {
                      console.log('[BookmarksWithPagination] CLI bookmark data:', {
                        id: bookmark.id,
                        hasContent: !!bookmark.content,
                        hasImageAssetId: !!bookmark.content?.imageAssetId,
                        hasImageUrl: !!bookmark.content?.imageUrl,
                        hasScreenshotAssetId: !!bookmark.content?.screenshotAssetId,
                        content: bookmark.content
                      });
                    }
                    return <BookmarkCardClient key={bookmark.id} {...bookmark} shareUrl={shareUrls.get(bookmark.id)} />;
                  })}
            </div>

            {/* Infinite scroll sentinel */}
            {enableInfiniteScroll && (
              <InfiniteScrollSentinel onIntersect={loadMore} loading={isLoadingMore} hasMore={hasMore} />
            )}
          </>
        )
      ) : (
        /* Server-side placeholder with hydration suppression */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {Array.isArray(initialBookmarks) &&
            initialBookmarks
              .slice(0, 6)
              .map((bookmark: UnifiedBookmark) => (
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
