"use client";

import { normalizeTagsToStrings, tagToSlug } from "@/lib/utils/tag-utils";
import type { UnifiedBookmark } from "@/types/schemas/bookmark";
import type { BookmarksWithPaginationClientProps } from "@/types/features/bookmarks";
import { Loader2, RefreshCw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { BookmarkCardClient } from "./bookmark-card.client";
import { TagsList } from "./tags-list.client";
import { BookmarkRefreshAlerts } from "./bookmark-refresh-alerts.client";
import { BookmarkPaginationNav } from "./bookmark-pagination-nav.client";
import { usePagination } from "@/hooks/use-pagination";
import { InfiniteScrollSentinel } from "@/components/ui/infinite-scroll-sentinel.client";
import { useBookmarkRefresh } from "@/hooks/use-bookmark-refresh";
import { useEngagementTracker } from "@/hooks/use-engagement-tracker";
import { ImpressionTracker } from "./impression-tracker.client";
import { CategoryRibbon } from "./category-ribbon.client";
import { HeroRow } from "./hero-row.client";
import { SectionBreak } from "./section-break.client";

const isDevelopment = process.env.NODE_ENV === "development";
const PRODUCTION_SITE_URL = "https://williamcallahan.com";
const IMAGE_PRELOAD_THRESHOLD = 4;

const getTagsAsStringArray = (tags: UnifiedBookmark["tags"]): string[] =>
  normalizeTagsToStrings(tags);
const normalizeCategoryValue = (value: string): string => value.trim().toLowerCase();

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
  initialCategory,
  description,
  className,
  feedMode = "discover",
  internalHrefs,
}) => {
  const normalizedInitialCategory = initialCategory?.trim() ? initialCategory.trim() : null;
  const [mounted, setMounted] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(initialTag || null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(
    normalizedInitialCategory,
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isRootBookmarksRoute = pathname === "/bookmarks";
  const showCategoryRibbon = pathname === "/bookmarks";
  const effectiveCategory = selectedCategory ?? normalizedInitialCategory;
  const normalizedEffectiveCategory = effectiveCategory
    ? normalizeCategoryValue(effectiveCategory)
    : null;
  const paginationQueryParams = useMemo<Record<string, string | number>>(() => {
    const params: Record<string, string | number> = {};
    if (feedMode === "latest") {
      params.feed = "latest";
    }
    if (tag) {
      params.tag = tag;
    }
    if (effectiveCategory) {
      params.category = effectiveCategory;
    }
    return params;
  }, [effectiveCategory, feedMode, tag]);

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
    initialData: feedMode === "latest" && !normalizedInitialCategory ? initialBookmarks : [],
    initialPage,
    initialTotalPages,
    initialTotalCount,
    queryParams: paginationQueryParams,
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
  const { trackImpression } = useEngagementTracker();

  useEffect(() => {
    setMounted(true);
    if (initialPage > 1) goToPage(initialPage);
  }, [initialPage, goToPage]);

  useEffect(() => {
    const category = searchParams.get("category");
    const normalizedCategory = category?.trim() ? category.trim() : null;
    setSelectedCategory((current) =>
      current === normalizedCategory ? current : normalizedCategory,
    );
  }, [pathname, searchParams]);

  const allTags = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    return bookmarks
      .flatMap((bookmark: UnifiedBookmark) => getTagsAsStringArray(bookmark.tags))
      .filter((t, i, self) => t && self.indexOf(t) === i)
      .toSorted((a, b) => a.localeCompare(b));
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    if (!Array.isArray(bookmarks)) return [];
    return bookmarks.filter((bookmark: UnifiedBookmark) => {
      if (
        normalizedEffectiveCategory &&
        (typeof bookmark.category !== "string" ||
          normalizeCategoryValue(bookmark.category) !== normalizedEffectiveCategory)
      ) {
        return false;
      }
      if (selectedTag && !tag) {
        return getTagsAsStringArray(bookmark.tags).includes(selectedTag);
      }
      return true;
    });
  }, [bookmarks, normalizedEffectiveCategory, selectedTag, tag]);

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

  const handleCategorySelect = useCallback(
    (category: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const normalizedCategory = category?.trim() ? category.trim() : null;

      if (normalizedCategory) {
        params.set("category", normalizedCategory);
        params.set("feed", "latest");
      } else {
        params.delete("category");
        params.set("feed", "latest");
      }

      setSelectedCategory(normalizedCategory);
      const query = params.toString();
      const nextUrl = query.length > 0 ? `${pathname}?${query}` : pathname;
      router.replace(nextUrl, { scroll: false });
      goToPage(1);
    },
    [goToPage, pathname, router, searchParams],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      goToPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [goToPage],
  );

  const currentPageRef = useRef(currentPage);
  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (initialPage > 1) return;
    if (selectedTag && currentPageRef.current !== 1) goToPage(1);
  }, [selectedTag, initialPage, goToPage]);

  const useUrlPagination = globalThis.window !== undefined && baseUrl !== "/bookmarks";
  const showPaginationNav = !enableInfiniteScroll;

  const paginatedSlice = (items: UnifiedBookmark[]): UnifiedBookmark[] => {
    if (enableInfiniteScroll) return items;
    if (items.length <= itemsPerPage) return items;
    return items.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  };

  const displayedBookmarks = paginatedSlice(filteredBookmarks);
  const heroBookmarks = feedMode === "discover" ? displayedBookmarks.slice(0, 3) : [];
  const gridBookmarks = feedMode === "discover" ? displayedBookmarks.slice(3) : displayedBookmarks;

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
    const totalCount = selectedTag && !tag ? filteredBookmarks.length : totalItems;
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

      {showFilterBar && (
        <div className="mb-6 space-y-3">
          {showCategoryRibbon && (
            <CategoryRibbon
              selectedCategory={effectiveCategory}
              onSelectAction={handleCategorySelect}
            />
          )}
          {allTags.length > 0 && (
            <TagsList tags={allTags} selectedTag={selectedTag} onTagSelectAction={handleTagClick} />
          )}
        </div>
      )}

      {mounted && showPaginationNav && (
        <BookmarkPaginationNav {...paginationProps} className="mb-6" />
      )}

      <div className="mb-6">
        {mounted ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-gray-500 dark:text-gray-400">
              {resultsCountText}
              {effectiveCategory && ` in "${effectiveCategory}"`}
              {selectedTag && ` tagged with "${selectedTag}"`}
              {lastRefreshed && (
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
                  · refreshed {lastRefreshed.toLocaleTimeString()}
                </span>
              )}
            </p>
            {isDevelopment && <span />}
          </div>
        ) : (
          <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded" suppressHydrationWarning />
        )}
      </div>

      {error && (
        <div className="text-center py-16 px-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400 text-lg mb-2">Error loading bookmarks</p>
          <p className="text-red-500 dark:text-red-300 text-sm">{error?.message}</p>
        </div>
      )}
      {!error && filteredBookmarks.length === 0 && isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={`skeleton-${String(i)}`} className="animate-pulse rounded-xl overflow-hidden">
              <div className="w-full aspect-video bg-gray-200 dark:bg-gray-700" />
              <div className="p-5 space-y-3">
                <div className="h-4 w-2/3 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-full bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-3 w-4/5 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      )}
      {!error && filteredBookmarks.length === 0 && !isLoading && (
        <div className="text-center py-16 px-4 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
          <p className="text-gray-400 dark:text-gray-500 text-lg mb-2">No bookmarks found</p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {selectedTag ? "Try selecting a different tag." : "No bookmarks available."}
          </p>
        </div>
      )}
      {!error && filteredBookmarks.length > 0 && (
        <>
          {feedMode === "discover" && (
            <HeroRow
              bookmarks={heroBookmarks}
              internalHrefs={internalHrefs}
              onImpression={trackImpression}
            />
          )}

          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {feedMode === "discover" ? "Latest Stories" : "All Stories"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-6">
            {gridBookmarks.map((bookmark, index) => (
              <React.Fragment key={bookmark.id}>
                {feedMode === "discover" && index > 0 && index % 8 === 0 && (
                  <SectionBreak
                    category={
                      gridBookmarks
                        .slice(index, index + 8)
                        .map((item) => item.category)
                        .find((category): category is string => Boolean(category)) ?? "More"
                    }
                  />
                )}
                <ImpressionTracker
                  contentType="bookmark"
                  contentId={bookmark.id}
                  onImpression={trackImpression}
                >
                  <BookmarkCardClient
                    {...bookmark}
                    internalHref={internalHrefs?.[bookmark.id]}
                    preload={index < IMAGE_PRELOAD_THRESHOLD}
                    variant={isRootBookmarksRoute ? undefined : "compact"}
                  />
                </ImpressionTracker>
              </React.Fragment>
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

      {showPaginationNav && <BookmarkPaginationNav {...paginationProps} className="mt-6 mb-6" />}
    </div>
  );
};
