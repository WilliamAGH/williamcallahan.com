/**
 * Bookmarks Client Component with Optional Features
 *
 * Displays a list of bookmarks with configurable search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks-with-options.client
 */
"use client";

import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import {
  getErrorMessage,
  type UnifiedBookmark,
  type BookmarksWithOptionsClientProps,
} from "@/types";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";

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

function isRefreshResult(obj: unknown): obj is import("@/types").RefreshResult {
  return !!obj && typeof obj === "object" && "status" in (obj as Record<string, unknown>);
}

function isUnifiedBookmarkArray(x: unknown): x is UnifiedBookmark[] {
  return (
    Array.isArray(x) &&
    x.every(
      (b) =>
        b &&
        typeof (b as { id?: unknown }).id === "string" &&
        typeof (b as { url?: unknown }).url === "string",
    )
  );
}

export const BookmarksWithOptions: React.FC<BookmarksWithOptionsClientProps> = ({
  bookmarks,
  showFilterBar = true,
  searchAllBookmarks = false,
  initialTag,
  description,
  internalHrefs: initialInternalHrefs,
}) => {
  // Add mounted state for hydration safety
  const [mounted, setMounted] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  // Tag expansion is now handled in the TagsList component
  const [allBookmarks, setAllBookmarks] = useState<UnifiedBookmark[]>(bookmarks);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Store internal hrefs mapping (critical for preventing 404s)
  const [internalHrefs, setInternalHrefs] = useState<Record<string, string>>(
    initialInternalHrefs ?? {},
  );
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [dataSource, setDataSource] = useState<"server" | "client">("server");
  const [refreshError, setRefreshError] = useState<string | null>(null);
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
    .toSorted((a, b) => a.localeCompare(b));

  // Determine which set of bookmarks to filter (tag filtering only, search via terminal)
  const bookmarksToFilter = searchAllBookmarks ? allBookmarks : bookmarks;

  // Filter bookmarks by selected tag only (search is handled via sitewide terminal)
  const filteredBookmarks = selectedTag
    ? bookmarksToFilter.filter((bookmark) => {
        const tagsAsString = getTagsAsStringArray(bookmark.tags);
        return tagsAsString.includes(selectedTag);
      })
    : bookmarksToFilter;

  const bookmarkCountLabel = filteredBookmarks.length === 1 ? "bookmark" : "bookmarks";
  const resultsCountText =
    filteredBookmarks.length === 0
      ? "No bookmarks found"
      : `Showing ${filteredBookmarks.length} ${bookmarkCountLabel}`;

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
          .catch(
            () => ({ error: null }) as import("@/types").ErrorResponse,
          )) as import("@/types").ErrorResponse;
        const errorMessage = errorData.error || `Refresh failed: ${response.status}`;
        throw new Error(errorMessage);
      }

      const resultJson: unknown = await response.json();
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
      setShowCrossEnvRefresh(false); // Hide banner after completion
    }
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      {/* Dev-only alerts - stacked when present */}
      {(refreshError || showCrossEnvRefresh || showRefreshButton) && (
        <div className="mb-4 space-y-3">
          {/* Refresh button row */}
          {showRefreshButton && (
            <div className="flex justify-end">
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
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
              </button>
            </div>
          )}

          {/* Refresh error */}
          {refreshError && !isRefreshing && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {refreshError}
            </div>
          )}

          {/* Cross-environment refresh banner */}
          {showCrossEnvRefresh && !isRefreshing && (
            <div className="text-sm text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
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
                  {"?"}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Description row */}
      {description && (
        <div className="mb-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm">{description}</p>
        </div>
      )}

      {/* Tags row */}
      {showFilterBar && allTags.length > 0 && (
        <div className="mb-6">
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        </div>
      )}

      {/* Section Header */}
      {!selectedTag && (
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Bookmarks Collection
        </h2>
      )}

      {/* Results count */}
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

            {/* Debug indicator - only show in development mode */}
            {isDevelopment && (
              <span
                className={`text-xs px-2 py-1 rounded-lg font-mono ${
                  dataSource === "server"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                }`}
              >
                Data source: {dataSource === "server" ? "Server-side" : "Client-side API"}
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
          {bookmarks.slice(0, 6).map((bookmark) => (
            <div
              key={bookmark.id}
              className="bg-white dark:bg-gray-800 rounded-3xl shadow-lg h-96"
              suppressHydrationWarning
            />
          ))}
        </div>
      )}
      {mounted && filteredBookmarks.length === 0 && (
        <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">No bookmarks found</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {selectedTag ? "Try selecting a different tag." : "No bookmarks available."}
          </p>
        </div>
      )}
      {mounted && filteredBookmarks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
          {filteredBookmarks.map((bookmark, index) => {
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
            return (
              <BookmarkCardClient
                key={bookmark.id}
                {...bookmark}
                internalHref={internalHref}
                preload={index < 4}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
