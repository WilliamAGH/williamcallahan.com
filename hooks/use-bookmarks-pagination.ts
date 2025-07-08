/**
 * React hook for paginated bookmark data fetching with infinite scroll support using SWR.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { Fetcher } from "swr";
import type {
  UseBookmarksPaginationOptions,
  UseBookmarksPaginationReturn,
  UnifiedBookmark,
  BookmarksResponse,
} from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Internal helper – placed outside the hook to keep stable reference for SWR.
// NOTE: `limit` is injected via URL search params so we can compute pagination
// metadata without relying on outer-scope variables that would otherwise be
// `any` or cause type-safety issues.
// ─────────────────────────────────────────────────────────────────────────────

const fetcher: Fetcher<BookmarksResponse, [string, number, number, string?]> = async ([
  requestKey,
  page,
  limit,
  tag,
]) => {
  // The first and fourth tuple elements are not used within the fetcher, but we must
  // reference them to comply with the no-unused-vars rule without relying on underscore
  // prefixes (forbidden by project standards).
  void requestKey;
  void tag;

  // Using SWR already provides an in-memory stale-while-revalidate layer. We
  // therefore avoid forcing `no-store`, allowing the browser to reuse cached
  // responses when available. On the server we hint to Next.js' data cache to
  // revalidate the resource every 60 seconds.
  const response = await fetch(`/api/bookmarks?page=${page}&limit=${limit}`);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to fetch bookmarks: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const json: unknown = await response.json();

  // The API returns { data: UnifiedBookmark[], meta: { pagination: {...} } }
  const apiResponse = json as BookmarksResponse;

  // The API already returns UnifiedBookmark objects, no conversion needed
  return apiResponse;
};

const SWR_KEY = "bookmarks";

export function useBookmarksPagination({
  limit = 24,
  initialData = [],
  initialPage = 1,
  initialTotalPages,
  initialTotalCount,
  tag,
}: UseBookmarksPaginationOptions = {}): UseBookmarksPaginationReturn {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const getKey = (
    pageIndex: number,
    previousPageData: BookmarksResponse | null,
  ): [string, number, number, string?] | null => {
    const page = pageIndex + 1;
    if (previousPageData && !previousPageData.meta.pagination.hasNext) return null;

    if (pageIndex === 0 && initialData && initialData.length > 0) {
      return null;
    }

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    if (tag) {
      params.append("tag", tag);
    }

    if (!initialTotalPages && initialTotalCount && pageIndex * limit >= initialTotalCount) return null;

    // The key is a tuple with the endpoint, page number, limit, and optional tag
    return [SWR_KEY, page, limit, tag];
  };

  const {
    data,
    error,
    size,
    setSize,
    isLoading: swrIsLoading,
    mutate,
  } = useSWRInfinite<BookmarksResponse | null, Error>(getKey, fetcher, {
    initialSize: initialPage,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    dedupingInterval: 5000,
    fallbackData:
      initialData.length > 0
        ? Array.from({ length: initialPage }).map((_, i) =>
            i === initialPage - 1
              ? {
                  data: initialData,
                  meta: {
                    pagination: {
                      total: initialTotalCount ?? initialData.length,
                      totalPages: initialTotalPages ?? 1,
                      page: initialPage,
                      hasNext: initialPage < (initialTotalPages ?? 1),
                      hasPrev: initialPage > 1,
                      limit: limit,
                    },
                  },
                }
              : null,
          )
        : [],
  });

  const bookmarks: UnifiedBookmark[] = data ? data.flatMap((page) => page?.data ?? []) : [];
  const isLoading = swrIsLoading;
  const isLoadingMore = swrIsLoading && size > 1;
  const totalItems = initialTotalCount ?? data?.[0]?.meta.pagination.total ?? 0;
  const totalPages = initialTotalPages ?? Math.ceil(totalItems / limit);

  const paginationMeta = useMemo(() => {
    const dataSource = data || [];

    if (!dataSource || dataSource.length === 0) {
      return {
        totalPages: 0,
        totalItems: 0,
        hasMore: false,
      };
    }

    const lastPage = dataSource.filter(Boolean).pop();
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

  const hasMore = bookmarks.length < (totalItems ?? 0);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && paginationMeta.hasMore) {
      void setSize(size + 1);
    }
  }, [isLoadingMore, paginationMeta.hasMore, setSize, size]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > paginationMeta.totalPages) return;

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
    totalPages,
    totalItems,
    isLoading: isLoading,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    goToPage,
    mutate: () => {
      void mutate();
    },
  };
}
