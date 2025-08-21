/**
 * Generic React hook for paginated data fetching with infinite scroll support using SWR.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { Fetcher } from "swr";
import type { UsePaginationOptions, UsePaginationReturn, PaginatedResponse } from "@/types";

// The fetcher is now defined inside the hook to capture the apiUrl.
const createFetcher =
  <T>(apiUrl: string): Fetcher<PaginatedResponse<T>, string> =>
  async url => {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to fetch data from ${apiUrl}: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const json: unknown = await response.json();
    return json as PaginatedResponse<T>;
  };

export function usePagination<T>({
  apiUrl,
  limit = 24,
  initialData = [],
  initialPage = 1,
  initialTotalPages,
  initialTotalCount,
  queryParams = {},
}: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const [currentPage, setCurrentPage] = useState(initialPage);

  const getKey = (pageIndex: number, previousPageData: PaginatedResponse<T> | null): string | null => {
    const page = pageIndex + 1;
    if (previousPageData && !previousPageData.meta.pagination.hasNext) return null;

    // Do not fetch if we have initial data for the first page.
    if (pageIndex === 0 && initialData && initialData.length > 0) {
      return null;
    }

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...Object.fromEntries(Object.entries(queryParams).map(([key, value]) => [key, String(value)])),
    });

    if (!initialTotalPages && initialTotalCount && pageIndex * limit >= initialTotalCount) return null;

    return `${apiUrl}?${params.toString()}`;
  };

  const fetcher = useMemo(() => createFetcher<T>(apiUrl), [apiUrl]);

  const {
    data,
    error,
    size,
    setSize,
    isLoading: swrIsLoading,
    mutate,
  } = useSWRInfinite<PaginatedResponse<T> | null, Error>(getKey, fetcher, {
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

  const items: T[] = data ? data.flatMap(page => page?.data ?? []) : [];
  const isLoading = swrIsLoading;
  const isLoadingMore = swrIsLoading && size > 1;
  const totalItems = initialTotalCount ?? data?.[0]?.meta.pagination.total ?? 0;
  const totalPages = initialTotalPages ?? Math.ceil(totalItems / limit);

  const paginationMeta = useMemo(() => {
    const dataSource = data || [];
    if (!dataSource || dataSource.length === 0) {
      return { totalPages: 0, totalItems: 0, hasMore: false };
    }
    const lastPage = dataSource.filter(Boolean).pop();
    if (!lastPage) {
      return { totalPages: 0, totalItems: 0, hasMore: false };
    }
    return {
      totalPages: lastPage.meta.pagination.totalPages,
      totalItems: lastPage.meta.pagination.total,
      hasMore: lastPage.meta.pagination.hasNext,
    };
  }, [data]);

  const hasMore = items.length < (totalItems ?? 0);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && paginationMeta.hasMore) {
      void setSize(size + 1);
    }
  }, [isLoadingMore, paginationMeta.hasMore, setSize, size]);

  const goToPage = useCallback(
    (page: number) => {
      if (page < 1 || page > paginationMeta.totalPages) return;
      if (size < page) {
        void setSize(page);
      }
      setCurrentPage(page);
    },
    [paginationMeta.totalPages, setSize, size],
  );

  return {
    items,
    currentPage,
    totalPages,
    totalItems,
    isLoading,
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
