import { useCallback, useMemo, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import type { UnifiedBookmark } from '@/types/bookmark';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface BookmarksResponse {
  data: UnifiedBookmark[];
  meta: {
    pagination: PaginationMeta;
  };
}

interface UseBookmarksPaginationOptions {
  limit?: number;
  initialData?: UnifiedBookmark[];
}

interface UseBookmarksPaginationReturn {
  bookmarks: UnifiedBookmark[];
  currentPage: number;
  totalPages: number;
  totalItems: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | undefined;
  loadMore: () => void;
  goToPage: (page: number) => void;
  mutate: () => void;
}

const fetcher = async (url: string): Promise<BookmarksResponse> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch bookmarks');
  }
  return response.json() as Promise<BookmarksResponse>;
};

export function useBookmarksPagination({
  limit = 24,
  initialData = []
}: UseBookmarksPaginationOptions = {}): UseBookmarksPaginationReturn {
  const [currentPage, setCurrentPage] = useState(1);

  const getKey = useCallback((pageIndex: number, previousPageData: BookmarksResponse | null) => {
    // Don't fetch if we've reached the end
    if (previousPageData && !previousPageData.meta.pagination.hasNextPage) return null;
    
    // API uses 1-based pagination
    return `/api/bookmarks?page=${pageIndex + 1}&limit=${limit}`;
  }, [limit]);

  const {
    data,
    error,
    size,
    setSize,
    mutate
  } = useSWRInfinite<BookmarksResponse>(getKey, fetcher, {
    revalidateFirstPage: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    fallbackData: initialData.length > 0 ? [{
      data: initialData.slice(0, limit),
      meta: {
        pagination: {
          page: 1,
          limit,
          total: initialData.length,
          totalPages: Math.ceil(initialData.length / limit),
          hasNextPage: initialData.length > limit,
          hasPreviousPage: false
        }
      }
    }] : undefined
  });

  const bookmarks = useMemo(() => {
    if (!data) return [];
    return data.flatMap((page: BookmarksResponse) => page.data);
  }, [data]);

  const paginationMeta = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        totalPages: 0,
        totalItems: 0,
        hasMore: false
      };
    }
    const lastPage = data[data.length - 1];
    return {
      totalPages: lastPage.meta.pagination.totalPages,
      totalItems: lastPage.meta.pagination.total,
      hasMore: lastPage.meta.pagination.hasNextPage
    };
  }, [data]);

  const isLoadingInitialData = !data && !error;
  const isLoadingMore = isLoadingInitialData || (size > 0 && data && typeof data[size - 1] === "undefined") as boolean;

  const loadMore = useCallback(() => {
    if (!isLoadingMore && paginationMeta.hasMore) {
      void setSize(size + 1);
    }
  }, [isLoadingMore, paginationMeta.hasMore, setSize, size]);

  const goToPage = useCallback((page: number) => {
    if (page < 1 || page > paginationMeta.totalPages) return;
    
    // For manual page navigation, we need to load all pages up to the requested page
    const pagesToLoad = page;
    if (size < pagesToLoad) {
      void setSize(pagesToLoad);
    }
    setCurrentPage(page);
  }, [paginationMeta.totalPages, setSize, size]);

  return {
    bookmarks,
    currentPage,
    totalPages: paginationMeta.totalPages,
    totalItems: paginationMeta.totalItems,
    isLoading: isLoadingInitialData,
    isLoadingMore: !!isLoadingMore,
    hasMore: paginationMeta.hasMore,
    error,
    loadMore,
    goToPage,
    mutate: () => void mutate()
  };
}