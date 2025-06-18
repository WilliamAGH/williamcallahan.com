import { renderHook, act } from "@testing-library/react";
import { useBookmarksPagination } from "@/hooks/use-bookmarks-pagination";
import useSWRInfinite from "swr/infinite";
import type { UnifiedBookmark } from "@/types/bookmark";

// Mock SWR
jest.mock("swr/infinite");

const mockBookmarks: UnifiedBookmark[] = Array.from({ length: 50 }, (_, i) => ({
  id: `bookmark-${i}`,
  url: `https://example.com/${i}`,
  title: `Bookmark ${i}`,
  description: `Description for bookmark ${i}`,
  tags: [`tag${i % 3}`],
  imageUrl: null,
  domain: "example.com",
  createdAt: "2024-01-01",
  updatedAt: "2024-01-01",
  isFavorite: false,
}));

describe("useBookmarksPagination", () => {
  const mockUseSWRInfinite = useSWRInfinite as jest.MockedFunction<typeof useSWRInfinite>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("initializes with correct default values", () => {
    mockUseSWRInfinite.mockReturnValue({
      data: undefined,
      error: undefined,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: true,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination());

    expect(result.current.currentPage).toBe(1);
    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("processes paginated data correctly", () => {
    const mockData = [
      {
        data: mockBookmarks.slice(0, 24),
        meta: {
          pagination: {
            page: 1,
            limit: 24,
            total: 50,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          },
        },
      },
    ];

    mockUseSWRInfinite.mockReturnValue({
      data: mockData,
      error: undefined,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination({ limit: 24 }));

    expect(result.current.bookmarks).toHaveLength(24);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalItems).toBe(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("handles initial page parameter", () => {
    mockUseSWRInfinite.mockReturnValue({
      data: undefined,
      error: undefined,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: true,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination({ initialPage: 3 }));

    expect(result.current.currentPage).toBe(3);
  });

  it("loads more pages when requested", () => {
    const mockSetSize = jest.fn();
    const mockData = [
      {
        data: mockBookmarks.slice(0, 24),
        meta: {
          pagination: {
            page: 1,
            limit: 24,
            total: 50,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          },
        },
      },
    ];

    mockUseSWRInfinite.mockReturnValue({
      data: mockData,
      error: undefined,
      size: 1,
      setSize: mockSetSize,
      mutate: jest.fn(),
      isValidating: false,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination());

    act(() => {
      result.current.loadMore();
    });

    expect(mockSetSize).toHaveBeenCalledWith(2);
  });

  it("navigates to specific page", () => {
    const mockSetSize = jest.fn();
    const mockData = [
      {
        data: mockBookmarks.slice(0, 24),
        meta: {
          pagination: {
            page: 1,
            limit: 24,
            total: 50,
            totalPages: 3,
            hasNext: true,
            hasPrev: false,
          },
        },
      },
    ];

    mockUseSWRInfinite.mockReturnValue({
      data: mockData,
      error: undefined,
      size: 1,
      setSize: mockSetSize,
      mutate: jest.fn(),
      isValidating: false,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination());

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);
    expect(mockSetSize).toHaveBeenCalledWith(3);
  });

  it("handles errors gracefully", () => {
    const mockError = new Error("Failed to fetch bookmarks");

    mockUseSWRInfinite.mockReturnValue({
      data: undefined,
      error: mockError,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => useBookmarksPagination());

    expect(result.current.error).toBe(mockError);
    expect(result.current.bookmarks).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("uses fallback data when provided", () => {
    const initialBookmarks = mockBookmarks.slice(0, 10);

    mockUseSWRInfinite.mockImplementation((getKey, fetcher, options) => {
      // The hook should provide fallback data
      expect(options?.fallbackData).toBeDefined();
      expect(options?.fallbackData?.[0].data).toHaveLength(10);

      return {
        data: options?.fallbackData,
        error: undefined,
        size: 1,
        setSize: jest.fn(),
        mutate: jest.fn(),
        isValidating: false,
        isLoading: false,
      } as any;
    });

    const { result } = renderHook(() =>
      useBookmarksPagination({
        initialData: initialBookmarks,
        limit: 24,
      }),
    );

    expect(result.current.bookmarks).toHaveLength(10);
  });
});
