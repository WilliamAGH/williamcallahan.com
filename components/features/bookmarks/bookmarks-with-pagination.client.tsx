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
import type { UnifiedBookmark } from "@/types";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
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
  totalPages: initialTotalPages,
  totalCount: initialTotalCount,
  baseUrl = "/bookmarks",
  initialTag,
  tag,
  className,
  internalHrefs,
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
  const [isSearching, setIsSearching] = useState(false);
  // ---------------------------------------------------------------------------
  // When the user is performing a TEXT SEARCH we paginate purely on the client
  // (because we already fetched the *entire* result-set via /api/search/bookmarks).
  // SWR's pagination meta does not know about those extra pages, so calling
  // `goToPage()` would early-return.  We therefore keep a dedicated local
  // page state that is only used while `searchQuery` is non-empty.
  // ---------------------------------------------------------------------------
  const [localSearchPage, setLocalSearchPage] = useState(initialPage);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Disable infinite scroll while the user is running a text search so that
  // page navigation (via <PaginationControl>) reflects the sliced subset
  // instead of rendering the entire result set.  This preserves expected UX
  // where clicking "page 2" updates the visible bookmarks list.
  const infiniteScrollActive = enableInfiniteScroll && searchQuery.trim() === "";

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
    initialTotalPages,
    initialTotalCount,
    tag: tag, // Pass tag for server-side filtering
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
    if (searchQuery === "" || searchQuery.trim().length === 0) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      try {
        setIsSearching(true);
        setIsSearchingAPI(true);

        // Call the dedicated bookmarks search endpoint so the server does
        // the heavy lifting and we transfer only the matched items.
        const response = await fetch(`/api/search/bookmarks?q=${encodeURIComponent(searchQuery)}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const json: unknown = await response.json();

        // Validate the API response using dynamic import to comply with codebase rules
        const { bookmarksSearchResponseSchema } = await import("@/types/bookmark");
        const validation = bookmarksSearchResponseSchema.safeParse(json);
        if (!validation.success) {
          console.error("[BookmarksSearch] Invalid API response format:", validation.error);
          throw new Error("Invalid API response format");
        }

        const allBookmarks: UnifiedBookmark[] = validation.data.data;

        // Simple client-side filtering (case-insensitive contains across key
        // fields). We reuse the same helper used in the memoized filter below
        // so behavior stays consistent.
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
        setIsSearching(false);
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
    if (searchResults && searchQuery) {
      // Do NOT pre-filter by tag here; the downstream logic (below) applies
      // the current selectedTag so that searches initiated while a tag is
      // still selected can recover once the tag is cleared.
      return searchResults;
    }

    if (!Array.isArray(bookmarks)) return [];
    // Otherwise, use client-side filtering on loaded bookmarks
    return bookmarks.filter((bookmark: UnifiedBookmark) => {
      const tagsAsString = getTagsAsStringArray(bookmark.tags);

      // Skip tag filtering if we're on a tag-specific page (server already filtered)
      // Only apply client-side tag filtering when user selects a different tag
      if (selectedTag && !tag && !tagsAsString.includes(selectedTag)) {
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
  }, [bookmarks, searchQuery, selectedTag, searchResults, tag]);

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    // Clear any active tag filter when the user starts a text search so that
    // search results are drawn from the full dataset.
    if (selectedTag) {
      setSelectedTag(null);
      if (goToPage) goToPage(1);
    }
    // Whenever a new query is typed we reset the local page state so the
    // user starts from the first page of the new result-set.
    setLocalSearchPage(1);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // The search happens automatically as the query is typed
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      // Clear filter
      setSelectedTag(null);
      router.push(baseUrl);
    } else {
      // New tag selected
      setSelectedTag(tag);
      // Navigate to the canonical tag URL (avoids nesting `/tags/.../tags/...`).
      router.push(`/bookmarks/tags/${tagToSlug(tag)}`);
    }
    if (goToPage) goToPage(1); // Reset to page 1
  };

  // Navigate to a specific page (used by PaginationControl during SSR fallback)
  const handlePageChange = useCallback(
    (page: number) => {
      if (searchQuery.trim() !== "") {
        // During a text search we ONLY update the local page index – no server
        // interaction needed because the full dataset is already in memory.
        setLocalSearchPage(page);
      } else {
        goToPage(page);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [goToPage, searchQuery],
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
  // Reset to page 1 whenever search query or selected tag changes.
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

    if ((searchQuery || selectedTag) && currentPageRef.current !== 1) {
      goToPage(1);
    }
  }, [searchQuery, selectedTag, initialPage, goToPage]);

  const displayBookmarks = useMemo(() => {
    if (searchResults) return searchResults;
    return filteredBookmarks;
  }, [searchResults, filteredBookmarks]);

  // ---------------------------------------------------------------------------
  // Derived pagination metrics — when the user is searching we fetch the
  // ENTIRE result-set at once (client side).  The server-provided `totalPages`
  // therefore becomes stale.  We recompute an *effective* total page count so
  // that pagination controls / labels remain accurate.
  // ---------------------------------------------------------------------------

  const effectiveTotalPages = useMemo(() => {
    const count = displayBookmarks?.length ?? 0;
    // Fallback to server value when we are *not* in a filtered/search view
    if (!searchQuery) return totalPages;
    return Math.max(1, Math.ceil(count / itemsPerPage));
  }, [displayBookmarks?.length, searchQuery, totalPages, itemsPerPage]);

  // When searching we avoid URL-based navigation (would trigger a full reload
  // and ignore search results).  Instead we fall back to the in-memory
  // <PaginationControl> component.
  const useUrlPagination = typeof window !== "undefined" && !searchQuery;

  const getCurrentPage = (): number => {
    return searchQuery.trim() !== "" ? localSearchPage : currentPage;
  };

  // Client-side safe slicer (applies to ANY view when we have more than one
  // page worth of items). This guarantees tag-search views correctly slice
  // irrespective of the `tag` prop coming from SSR.
  const paginatedSlice = (items: UnifiedBookmark[]): UnifiedBookmark[] => {
    if (infiniteScrollActive) return items; // avoid slicing for infinite scroll when active
    if (items.length <= itemsPerPage) return items;
    const pageNum = getCurrentPage();
    return items.slice((pageNum - 1) * itemsPerPage, pageNum * itemsPerPage);
  };

  // ---------------------------------------------------------------------------
  // Keep `currentPage` in sync with URL navigation triggered by <Link> (i.e.,
  // PaginationControlUrl).  This provides immediate visual feedback instead
  // of waiting for the server round-trip.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const match = pathname.match(/\/page\/(\d+)/);
    const pageFromPath = match ? Number(match[1]) : 1;
    if (!Number.isNaN(pageFromPath) && pageFromPath !== currentPage) {
      goToPage(pageFromPath);
    }
    // `goToPage` is a stable callback from the pagination hook – safe omit.
  }, [pathname, goToPage, currentPage]);

  // ---------------------------------------------------------------------------
  // Keep `localSearchPage` in sync with the URL (?page=N) *while a text search
  // is active*.  This allows refresh / copy-link to land on the same page.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (searchQuery.trim() === "") return; // Only relevant for search views

    const pageParam = Number(searchParams.get("page"));
    if (!Number.isNaN(pageParam) && pageParam > 0 && pageParam !== localSearchPage) {
      setLocalSearchPage(Math.min(pageParam, effectiveTotalPages));
    }
  }, [searchQuery, searchParams, effectiveTotalPages, localSearchPage]);

  // ---------------------------------------------------------------------------
  // Clamp `localSearchPage` whenever the effective total shrinks (e.g. user
  // narrows the query so there are fewer pages than before).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (localSearchPage > effectiveTotalPages) {
      setLocalSearchPage(effectiveTotalPages);
    }
  }, [localSearchPage, effectiveTotalPages]);

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
      {mounted && effectiveTotalPages > 1 && (
        <div className="mb-6 flex justify-end">
          {useUrlPagination ? (
            <PaginationControlUrl
              currentPage={getCurrentPage()}
              totalPages={effectiveTotalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              isLoading={isLoading || isLoadingMore}
              baseUrl={baseUrl}
            />
          ) : (
            <PaginationControl
              currentPage={getCurrentPage()}
              totalPages={effectiveTotalPages}
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

                  // While search is in progress, show the query inline and move the ellipsis
                  if (isSearching) {
                    return searchQuery ? `Searching for ${searchQuery}…` : "Searching…";
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

                  const pageNum = getCurrentPage();
                  const start = (pageNum - 1) * itemsPerPage + 1;
                  const end = Math.min(pageNum * itemsPerPage, totalCount);

                  return `Showing ${start}-${end} of ${totalCount} bookmarks`;
                })()}
                {!isSearching && searchQuery && ` for ${searchQuery}`}
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
                  Page {getCurrentPage()}/{effectiveTotalPages}
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
        ) : isSearching ? (
          <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400 mx-auto" />
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
                paginatedSlice(displayBookmarks).map((bookmark) => {
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
                    <BookmarkCardClient key={bookmark.id} {...bookmark} internalHref={internalHrefs?.[bookmark.id]} />
                  );
                })}
            </div>

            {/* Infinite scroll sentinel */}
            {infiniteScrollActive && (
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
              .map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg h-96"
                  suppressHydrationWarning
                />
              ))}
        </div>
      )}

      {/* Pagination controls at the bottom */}
      {effectiveTotalPages > 1 && (
        <div className="mt-6 mb-6 flex justify-end">
          {useUrlPagination ? (
            <PaginationControlUrl
              currentPage={getCurrentPage()}
              totalPages={effectiveTotalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              isLoading={isLoading || isLoadingMore}
              baseUrl={baseUrl}
            />
          ) : (
            <PaginationControl
              currentPage={getCurrentPage()}
              totalPages={effectiveTotalPages}
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
