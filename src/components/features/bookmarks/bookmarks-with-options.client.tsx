/**
 * Bookmarks Client Component with Optional Features
 *
 * Displays a list of bookmarks with configurable search and filtering functionality.
 *
 * @module components/features/bookmarks/bookmarks-with-options.client
 */
"use client";

import { normalizeTagsToStrings } from "@/lib/utils/tag-utils";
import { type UnifiedBookmark, type BookmarksWithOptionsClientProps } from "@/types";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { useBookmarkRefresh } from "@/hooks/use-bookmark-refresh";
import { useClientBookmarks } from "@/hooks/use-client-bookmarks";

const isDevelopment = process.env.NODE_ENV === "development";
const PRODUCTION_SITE_URL = "https://williamcallahan.com";
/** Number of skeleton placeholder cards shown during SSR */
const SKELETON_PLACEHOLDER_COUNT = 6;
/** Number of leading cards eligible for image preloading */
const IMAGE_PRELOAD_THRESHOLD = 4;

const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] => {
  return normalizeTagsToStrings(tags);
};

export const BookmarksWithOptions: React.FC<BookmarksWithOptionsClientProps> = ({
  bookmarks,
  showFilterBar = true,
  searchAllBookmarks = false,
  initialTag,
  description,
  internalHrefs: initialInternalHrefs,
}) => {
  const [mounted, setMounted] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  const router = useRouter();

  // Determine if refresh button should be shown
  const coolifyUrl = process.env.NEXT_PUBLIC_COOLIFY_URL;
  let showRefreshButton = isDevelopment;
  if (coolifyUrl) {
    const normalizedCoolifyUrl = coolifyUrl.endsWith("/") ? coolifyUrl.slice(0, -1) : coolifyUrl;
    const normalizedTargetUrl = PRODUCTION_SITE_URL;
    if (normalizedCoolifyUrl === normalizedTargetUrl) {
      showRefreshButton = false;
    }
  }

  // Delegate client-side bookmark fetching to dedicated hook
  const {
    bookmarks: clientBookmarks,
    internalHrefs,
    dataSource,
    fetchError,
    refetch,
  } = useClientBookmarks({
    serverBookmarks: bookmarks,
    serverInternalHrefs: initialInternalHrefs ?? {},
    enabled: searchAllBookmarks,
    mounted,
  });

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
    showRefreshButton,
    onRefreshSuccess: async () => {
      await refetch();
      router.refresh();
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeBookmarks = searchAllBookmarks ? clientBookmarks : bookmarks;

  const allTags = activeBookmarks
    .flatMap((bookmark) => getTagsAsStringArray(bookmark.tags))
    .filter((tag, index, self) => tag && self.indexOf(tag) === index)
    .toSorted((a, b) => a.localeCompare(b));

  const filteredBookmarks = selectedTag
    ? activeBookmarks.filter((bookmark) => {
        const tagsAsString = getTagsAsStringArray(bookmark.tags);
        return tagsAsString.includes(selectedTag);
      })
    : activeBookmarks;

  const bookmarkCountLabel = filteredBookmarks.length === 1 ? "bookmark" : "bookmarks";
  const resultsCountText =
    filteredBookmarks.length === 0
      ? "No bookmarks found"
      : `Showing ${filteredBookmarks.length} ${bookmarkCountLabel}`;

  const handleTagClick = (tag: string) => {
    setSelectedTag(selectedTag === tag ? null : tag);
  };

  const displayError = fetchError || refreshError;

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8">
      {(displayError || showCrossEnvRefresh || showRefreshButton) && (
        <div className="mb-4 space-y-3">
          {showRefreshButton && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  dismissCrossEnvRefresh();
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

          {displayError && !isRefreshing && (
            <div className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg">
              {displayError}
            </div>
          )}

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

      {description && (
        <div className="mb-4">
          <p className="text-gray-500 dark:text-gray-400 text-sm">{description}</p>
        </div>
      )}

      {showFilterBar && allTags.length > 0 && (
        <div className="mb-6">
          <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
        </div>
      )}

      {!selectedTag && (
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Bookmarks Collection
        </h2>
      )}

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

      {!mounted && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6" suppressHydrationWarning>
          {bookmarks.slice(0, SKELETON_PLACEHOLDER_COUNT).map((bookmark) => (
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
            const internalHrefFromMap = internalHrefs[bookmark.id];
            const internalHref = internalHrefFromMap ?? bookmark.url;
            if (!internalHrefFromMap) {
              console.warn(
                `[BookmarksWithOptions] Missing slug for ${bookmark.id}. Using external URL fallback: ${bookmark.url}`,
              );
            }
            return (
              <BookmarkCardClient
                key={bookmark.id}
                {...bookmark}
                internalHref={internalHref}
                preload={index < IMAGE_PRELOAD_THRESHOLD}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};
