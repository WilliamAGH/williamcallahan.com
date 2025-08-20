/**
 * Bookmarks Client Component with Optional Features
 *
 * Displays a list of bookmarks with configurable search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks-with-options.client
 */
"use client";

import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import type { UnifiedBookmark } from "@/types";
import { ArrowRight, Loader2, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";

import type { BookmarksWithOptionsClientProps } from "@/types";

// Environment detection helper
const isDevelopment = process.env.NODE_ENV === "development";

// Use the shared utility for tag normalization
const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

function isBookmarksApiResponse(
  obj: unknown,
): obj is { data: UnifiedBookmark[]; internalHrefs?: Record<string, string>; meta?: unknown } {
  if (!obj || typeof obj !== "object") return false;
  const maybe = obj as Record<string, unknown>;
  return Array.isArray(maybe.data);
}

function isUnifiedBookmarkArray(x: unknown): x is UnifiedBookmark[] {
  return (
    Array.isArray(x) &&
    x.every(
      (b) => b && typeof (b as { id?: unknown }).id === "string" && typeof (b as { url?: unknown }).url === "string",
    )
  );
}

export const BookmarksWithOptions: React.FC<BookmarksWithOptionsClientProps> = ({
  bookmarks,
  showFilterBar = true,
  searchAllBookmarks = false,
  initialTag,
  internalHrefs: initialInternalHrefs,
}) => {
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  // Tag expansion is now handled in the TagsList component
  const [allBookmarks, setAllBookmarks] = useState<UnifiedBookmark[]>(bookmarks);
  // Using setIsSearching in handleSearchSubmit
  const [isSearching, setIsSearching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Store internal hrefs mapping (critical for preventing 404s)
  const [internalHrefs, setInternalHrefs] = useState<Record<string, string>>(initialInternalHrefs ?? {});
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<"server" | "client">("server");
  // Currently unused filter UI states - can be removed if the feature is not being developed
  // const [showFilters, setShowFilters] = useState(false);
  // const [showSort, setShowSort] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<UnifiedBookmark[] | null>(null);
  const [isSearchingAPI, setIsSearchingAPI] = useState(false);
  const [showCrossEnvRefresh, setShowCrossEnvRefresh] = useState(false);
  const [isRefreshingProduction, setIsRefreshingProduction] = useState(false);
  const router = useRouter();

  // Determine if refresh button should be shown
  const coolifyUrl = process.env.NEXT_PUBLIC_COOLIFY_URL;
  const targetUrl = "https://williamcallahan.com";
  let showRefreshButton = isDevelopment; // Only in dev environment
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
        setIsSearching(true);
        setIsSearchingAPI(true);
        const response = await fetch(`/api/search/bookmarks?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const raw: unknown = await response.json();

          // Bookmark search API returns { data: UnifiedBookmark[] }
          const bookmarkResults = Array.isArray(raw) ? raw : ((raw as { data?: unknown })?.data ?? []);

          if (Array.isArray(bookmarkResults) && isUnifiedBookmarkArray(bookmarkResults)) {
            setSearchResults(bookmarkResults);
          } else {
            setSearchResults(null);
          }
        } else {
          // API failed, fall back to client-side search
          setSearchResults(null);
        }
      } catch (error) {
        console.warn("Search API failed, falling back to client-side search:", error);
        setSearchResults(null);
      } finally {
        setIsSearching(false);
        setIsSearchingAPI(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  // Separate effect for fetching bookmarks
  useEffect(() => {
    if (searchAllBookmarks && mounted) {
      void (async () => {
        try {
          console.log("Client-side: Attempting to fetch bookmarks from API");
          // Add a random query parameter to bust cache
          const timestamp = Date.now();
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

          const responseData: unknown = await response.json();
          if (!isBookmarksApiResponse(responseData)) {
            console.error("Client-side: Invalid /api/bookmarks response shape", responseData);
            setAllBookmarks(bookmarks);
            return;
          }
          const allBookmarksData: UnifiedBookmark[] = isUnifiedBookmarkArray(responseData.data)
            ? responseData.data
            : [];
          const apiInternalHrefs = responseData.internalHrefs;
          console.log("Client-side direct fetch bookmarks count:", allBookmarksData?.length || 0);
          console.log("Client-side direct fetch has internalHrefs:", !!apiInternalHrefs);

          if (Array.isArray(allBookmarksData) && allBookmarksData.length > 0) {
            setAllBookmarks(allBookmarksData);
            // CRITICAL: Update the slug mappings from API
            if (apiInternalHrefs) {
              setInternalHrefs(apiInternalHrefs);
              console.log("BookmarksWithOptions: Updated internalHrefs from API");
            } else {
              console.error(
                "BookmarksWithOptions: WARNING - No internalHrefs from API. Cards will fall back to external URLs.",
              );
            }
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
      setSelectedTag(null);
    } else {
      setSelectedTag(tag);
    }
  };

  // We no longer modify the URL when tag selection changes during client
  // interaction. The SSR route already reflects the initial tag. Keeping the
  // URL stable prevents unintended refreshes while the user is typing.

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
        const errorData = (await response
          .json()
          .catch(() => ({ error: null }) as import("@/types").ErrorResponse)) as import("@/types").ErrorResponse;
        const errorMessage = errorData.error || `Refresh failed: ${response.status}`;
        throw new Error(errorMessage);
      }

      const resultJson: unknown = await response.json();
      function isRefreshResult(obj: unknown): obj is import("@/types").RefreshResult {
        return !!obj && typeof obj === "object" && "status" in (obj as Record<string, unknown>);
      }
      if (!isRefreshResult(resultJson)) {
        throw new Error("Unexpected response from refresh endpoint");
      }
      const result = resultJson;
      console.log("Bookmarks refresh result:", result);

      // If refresh was successful, fetch the new bookmarks
      if (result.status === "success") {
        const timestamp = Date.now();
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

        const refreshedJson: unknown = await bookmarksResponse.json();
        let refreshedArray: UnifiedBookmark[] = [];
        let refreshedInternalHrefs: Record<string, string> | undefined;
        if (Array.isArray(refreshedJson)) {
          refreshedArray = isUnifiedBookmarkArray(refreshedJson) ? refreshedJson : [];
        } else if (refreshedJson && typeof refreshedJson === "object") {
          const obj = refreshedJson as Record<string, unknown>;
          if (Array.isArray(obj.data) && isUnifiedBookmarkArray(obj.data)) {
            refreshedArray = obj.data;
          }
          if (obj.internalHrefs && typeof obj.internalHrefs === "object") {
            refreshedInternalHrefs = obj.internalHrefs as Record<string, string>;
          }
        }

        if (refreshedArray.length > 0) {
          setAllBookmarks(refreshedArray);
          // CRITICAL: Update slug mappings after refresh
          if (refreshedInternalHrefs) {
            setInternalHrefs(refreshedInternalHrefs);
            console.log("Bookmarks refresh: Updated internalHrefs");
          } else {
            console.error("Bookmarks refresh: WARNING - No internalHrefs, URLs will cause 404s!");
          }
          setLastRefreshed(new Date());
          setDataSource("client");
          console.log("Bookmarks refreshed successfully:", refreshedArray.length);
          // Show cross-environment refresh option for non-production
          if (showRefreshButton && !isRefreshingProduction) {
            setShowCrossEnvRefresh(true);
          }
          router.refresh();
        } else {
          console.warn("Refresh returned empty or invalid data shape:", refreshedJson);
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
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error("[Bookmarks] Production refresh failed:", errorData?.message || response.statusText);
        setRefreshError(`Production refresh failed: ${errorData?.message || response.statusText}`);
        setTimeout(() => setRefreshError(null), 5000);
      } else {
        console.log("[Bookmarks] Production refresh initiated successfully");
      }
    } catch (error) {
      console.error("[Bookmarks] Failed to trigger production refresh:", error);
      setRefreshError("Failed to trigger production refresh");
      setTimeout(() => setRefreshError(null), 5000);
    } finally {
      setIsRefreshingProduction(false);
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

          {/* Refresh button – always present; visibility toggles after hydration */}
          {showRefreshButton && (
            <button
              type="button"
              onClick={() => {
                setShowCrossEnvRefresh(false);
                void refreshBookmarks();
              }}
              disabled={isRefreshing}
              className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Refresh Bookmarks"
              style={{ visibility: mounted ? "visible" : "hidden" }}
            >
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          )}
          {/* Display Refresh Error */}
          {refreshError && !isRefreshing && (
            <div className="mt-2 text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {refreshError}
            </div>
          )}
          {/* Cross-environment refresh option */}
          {showCrossEnvRefresh && !isRefreshing && (
            <div className="mt-2 text-sm text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
              {isRefreshingProduction ? (
                <span className="flex items-center">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Triggering production refresh...
                </span>
              ) : (
                <>
                  Local refresh completed. Would you like to{" "}
                  <button
                    type="button"
                    onClick={handleProductionRefresh}
                    className="underline hover:text-blue-700 dark:hover:text-blue-200 font-medium"
                    disabled={isRefreshingProduction}
                  >
                    refresh production environment as well
                  </button>
                  ?
                </>
              )}
            </div>
          )}
        </div>

        {/* Tags filter - only show if showFilterBar is true */}
        {showFilterBar && allTags.length > 0 && (
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        )}
      </div>

      {/* Section Header */}
      {!searchQuery && !selectedTag && (
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white px-4 sm:px-6 lg:px-8">
          Bookmarks Collection
        </h2>
      )}

      {/* Results count */}
      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between">
            <div>
              <p className="text-gray-500 dark:text-gray-400">
                {isSearching
                  ? "Searching…"
                  : filteredBookmarks.length === 0
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
        isSearching ? (
          <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <Loader2 className="h-10 w-10 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : filteredBookmarks.length === 0 && searchQuery ? (
          <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
            <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">
              No bookmarks found for &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Try adjusting your search terms or filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
            {filteredBookmarks.map((bookmark) => {
              // Use pre-computed href from server if available
              // CRITICAL: Never fallback to using bookmark.id in the URL!
              const internalHref = internalHrefs?.[bookmark.id] ?? bookmark.url;
              if (!internalHrefs?.[bookmark.id]) {
                console.warn(
                  `[BookmarksWithOptions] Missing slug for ${bookmark.id}. Using external URL fallback: ${bookmark.url}`,
                );
              }

              // Debug: Log bookmark data for CLI bookmark (dev-only)
              if (isDevelopment && bookmark.id === "yz7g8v8vzprsd2bm1w1cjc4y") {
                console.log("[BookmarksWithOptions] CLI bookmark data:", {
                  id: bookmark.id,
                  hasContent: !!bookmark.content,
                  hasImageAssetId: !!bookmark.content?.imageAssetId,
                  hasImageUrl: !!bookmark.content?.imageUrl,
                  hasScreenshotAssetId: !!bookmark.content?.screenshotAssetId,
                  content: bookmark.content,
                });
              }
              return <BookmarkCardClient key={bookmark.id} {...bookmark} internalHref={internalHref} />;
            })}
          </div>
        )
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
