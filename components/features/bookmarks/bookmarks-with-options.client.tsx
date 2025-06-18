/**
 * Bookmarks Client Component with Optional Features
 *
 * Displays a list of bookmarks with configurable search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks-with-options.client
 */
"use client";

import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark } from "@/types";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";

interface BookmarksWithOptionsProps {
  bookmarks: UnifiedBookmark[];
  showFilterBar?: boolean;
  searchAllBookmarks?: boolean;
  initialTag?: string;
}

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === "development";

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithOptions: React.FC<BookmarksWithOptionsProps> = ({
  bookmarks,
  showFilterBar = true,
  searchAllBookmarks = false,
  initialTag,
}) => {
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  // Tag expansion is now handled in the TagsList component
  const [allBookmarks, setAllBookmarks] = useState<UnifiedBookmark[]>(bookmarks);
  // Using setIsSearching in handleSearchSubmit
  const [, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<"server" | "client">("server");
  // Currently unused filter UI states - can be removed if the feature is not being developed
  // const [showFilters, setShowFilters] = useState(false);
  // const [showSort, setShowSort] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UnifiedBookmark[] | null>(null);
  const [isSearchingAPI, setIsSearchingAPI] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
              const matchingBookmark = [...allBookmarks, ...bookmarks].find(b => 
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
  }, [searchQuery, allBookmarks, bookmarks]);

  // Separate effect for fetching bookmarks
  useEffect(() => {
    if (searchAllBookmarks && mounted) {
      void (async () => {
        try {
          console.log("Client-side: Attempting to fetch bookmarks from API");
          // Add a random query parameter to bust cache
          const timestamp = new Date().getTime();
          console.log("BookmarksWithOptions: Fetching client-side data with timestamp", timestamp);
          const response = await fetch(`/api/bookmarks?t=${timestamp}`, {
            method: "GET",
            headers: {
              Accept: "application/json",
            },
            cache: "no-store",
          });
          console.log("BookmarksWithOptions: Fetch response status:", response.status);

          if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
          }

          const responseData = await response.json() as { data: UnifiedBookmark[]; meta: unknown };
          const allBookmarksData = responseData.data;
          console.log("Client-side direct fetch bookmarks count:", allBookmarksData?.length || 0);

          if (Array.isArray(allBookmarksData) && allBookmarksData.length > 0) {
            setAllBookmarks(allBookmarksData);
            // Explicitly force the dataSource to client
            console.log("BookmarksWithOptions: Setting data source to client-side");
            setDataSource("client");
          } else {
            console.error("Client-side: API returned empty or invalid data", responseData);
            // Fallback to provided bookmarks
            setAllBookmarks(bookmarks);
          }
        } catch (error) {
          console.error("Failed to load all bookmarks:", error);
          // Fallback to provided bookmarks
          console.log("Client-side: Falling back to provided bookmarks. Count:", bookmarks.length);
          setAllBookmarks(bookmarks);
        }
      })();
    } else {
      console.log("Client-side: Using provided bookmarks directly. Count:", bookmarks.length);
    }
  }, [searchAllBookmarks, bookmarks, mounted]);

  // Tag formatting is now handled in the TagsList component

  // Extract all unique tags from all available bookmarks
  const allTags = (searchAllBookmarks ? allBookmarks : bookmarks)
    .flatMap((bookmark) => {
      return getTagsAsStringArray(bookmark.tags);
    })
    .filter((tag, index, self) => tag && self.indexOf(tag) === index)
    .sort();

  // Determine which set of bookmarks to filter
  const bookmarksToFilter = searchAllBookmarks && searchQuery ? allBookmarks : bookmarks;

  const filteredBookmarks = (() => {
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

    // Otherwise, use the original client-side filtering logic
    return bookmarksToFilter.filter((bookmark) => {
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
  })();

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setIsSearching(true);
    // The search happens automatically as the query is typed
  };

  const handleTagClick = (tag: string) => {
    if (selectedTag === tag) {
      // Clear filter
      setSelectedTag(null);
    } else {
      // New tag selected
      setSelectedTag(tag);
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

  // Function to refresh bookmarks data
  const refreshBookmarks = async () => {
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

      // If refresh was successful, fetch the new bookmarks
      if (result.status === "success") {
        const timestamp = new Date().getTime();
        const bookmarksResponse = await fetch(`/api/bookmarks?t=${timestamp}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });

        if (!bookmarksResponse.ok) {
          throw new Error(`Failed to fetch updated bookmarks: ${bookmarksResponse.status}`);
        }

        const refreshedBookmarks = (await bookmarksResponse.json()) as UnifiedBookmark[];

        if (Array.isArray(refreshedBookmarks) && refreshedBookmarks.length > 0) {
          setAllBookmarks(refreshedBookmarks);
          setLastRefreshed(new Date());
          setDataSource("client");
          console.log("Bookmarks refreshed successfully:", refreshedBookmarks.length);
          router.refresh();
        }
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
  };

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
              onClick={() => void refreshBookmarks()}
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

      {/* Results count */}
      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {filteredBookmarks.length === 0
                  ? "No bookmarks found"
                  : `Showing ${filteredBookmarks.length} bookmark${filteredBookmarks.length === 1 ? "" : "s"}`}
                {searchQuery && ` for "${searchQuery}"`}
                {selectedTag && ` tagged with "${selectedTag}"`}
                {searchQuery && searchAllBookmarks && " across all bookmarks"}
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
                <span
                  className={`px-2 py-1 rounded-lg font-mono ${
                    dataSource === "server"
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  }`}
                >
                  Data source: {dataSource === "server" ? "Server-side" : "Client-side API"}
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
          {filteredBookmarks.length === 0 && searchQuery ? (
            <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
                No bookmarks found for &ldquo;{searchQuery}&rdquo;
              </p>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Try adjusting your search terms or filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
              {filteredBookmarks.map((bookmark) => {
                // Generate share URL once per bookmark to avoid per-card API calls
                const shareUrl = `/bookmarks/${generateUniqueSlug(bookmark.url, bookmarks.map(b => ({ id: b.id, url: b.url })), bookmark.id)}`;
                return <BookmarkCardClient key={bookmark.id} {...bookmark} shareUrl={shareUrl} />;
              })}
            </div>
          )}
        </>
      ) : (
        /* Server-side placeholder with hydration suppression */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {bookmarks.slice(0, 6).map((bookmark) => (
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
