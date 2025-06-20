import { useCallback, useMemo, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { BookmarksResponse, UnifiedBookmark } from "@/types/bookmark";
import type { UseBookmarksPaginationOptions, UseBookmarksPaginationReturn } from "@/types/features/bookmarks";
import { bookmarkListResponseSchema } from "@/lib/schemas/bookmarks";
import { convertRawBookmarksToUnified } from "@/lib/bookmarks/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper – placed outside the hook to keep stable reference for SWR.
// NOTE: `limit` is injected via URL search params so we can compute pagination
// metadata without relying on outer-scope variables that would otherwise be
// `any` or cause type-safety issues.
// ─────────────────────────────────────────────────────────────────────────────

const fetcher = async (url: string): Promise<BookmarksResponse> => {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch bookmarks: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const json: unknown = await response.json();
  const validation = bookmarkListResponseSchema.safeParse(json);

  if (!validation.success) {
    console.error("Invalid bookmark response:", validation.error);
    throw new Error("Invalid bookmark response format");
  }

  // Derive pagination information from the request URL itself so the fetcher
  // remains pure and free of hidden dependencies.
  const urlObj = new URL(url, "http://internal.local");
  const pageParam = Number(urlObj.searchParams.get("page") ?? 1);
  const limitParam = Number(urlObj.searchParams.get("limit") ?? validation.data.bookmarks.length);

  const total = validation.data.bookmarks.length;
  const totalPages = Math.max(1, Math.ceil(total / limitParam));

  return {
    data: convertRawBookmarksToUnified(validation.data.bookmarks),
    meta: {
      pagination: {
        page: pageParam,
        limit: limitParam,
        total,
        totalPages,
        hasNext: pageParam < totalPages,
        hasPrev: pageParam > 1,
      },
    },
  };
};

export function useBookmarksPagination({
  limit = 24,
  initialData = [],
  initialPage = 1,
  tag,
}: UseBookmarksPaginationOptions = {}): UseBookmarksPaginationReturn {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const getKey = useCallback(
    (pageIndex: number, previousPageData: BookmarksResponse | null) => {
      // Don't fetch if we've reached the end
      if (previousPageData && !previousPageData.meta.pagination.hasNext) return null;

      // Build URL with pagination and optional tag filter
      const params = new URLSearchParams({
        page: String(pageIndex + 1),
        limit: String(limit),
      });

      if (tag) {
        params.append("tag", tag);
      }

      return `/api/bookmarks?${params.toString()}`;
    },
    [limit, tag],
  );

  // Prepare fallbackData in the expected format if initialData is provided
  const fallbackData = useMemo((): BookmarksResponse[] | undefined => {
    if (!initialData || initialData.length === 0) return undefined;
    
    const response: BookmarksResponse = {
      data: initialData,
      meta: {
        pagination: {
          page: 1,
          limit: limit,
          total: initialData.length,
          totalPages: Math.ceil(initialData.length / limit),
          hasNext: initialData.length > limit,
          hasPrev: false,
        },
      },
    };
    
    return [response];
  }, [initialData, limit]);

  const { data, error, size, setSize, mutate } = useSWRInfinite<BookmarksResponse, Error>(getKey, fetcher, {
    revalidateFirstPage: false,
    revalidateAll: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    fallbackData,
    initialSize: 1,
  });

  const bookmarks: UnifiedBookmark[] = useMemo(
    () => (data ?? fallbackData ?? []).filter((page): page is BookmarksResponse => !!page).flatMap((page) => page.data ?? []),
    [data, fallbackData],
  );

  const paginationMeta = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        totalPages: 0,
        totalItems: 0,
        hasMore: false,
      };
    }
    const lastPage = data.filter(Boolean).pop();
    if (!lastPage) {
      return {
        totalPages: 0,
        totalItems: 0,
        hasMore: false,
      };
    }
    return {
      totalPages: lastPage.meta.pagination.totalPages,
      totalItems: lastPage.meta.pagination.total,
      hasMore: lastPage.meta.pagination.hasNext,
    };
  }, [data]);

  const isLoadingInitialData = !data && !error;
  const isLoadingMore =
    isLoadingInitialData || ((size > 0 && data && typeof data[size - 1] === "undefined") as boolean);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && paginationMeta.hasMore) {
      void setSize(size + 1);
    }
  }, [isLoadingMore, paginationMeta.hasMore, setSize, size]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > paginationMeta.totalPages) return;

      // For manual page navigation, we need to load all pages up to the requested page
      const pagesToLoad = page;
      if (size < pagesToLoad) {
        void setSize(pagesToLoad);
      }
      setCurrentPage(page);
    },
    [paginationMeta.totalPages, setSize, size],
  );

  return {
    bookmarks,
    currentPage,
    totalPages: paginationMeta.totalPages,
    totalItems: paginationMeta.totalItems,
    isLoading: isLoadingInitialData,
    isLoadingMore: Boolean(isLoadingMore),
    hasMore: paginationMeta.hasMore,
    error,
    loadMore,
    goToPage,
    mutate: () => {
      void mutate();
    },
  };
}
