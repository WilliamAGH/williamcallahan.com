import { renderHook, act } from "@testing-library/react";
import { usePagination } from "@/hooks/use-pagination";
import useSWRInfinite from "swr/infinite";
import type { UnifiedBookmark, PaginatedResponse } from "@/types";

// Mock SWR
jest.mock("swr/infinite");

const mockItems: UnifiedBookmark[] = Array.from({ length: 50 }, (_, i) => ({
  id: `item-${i}`,
  url: `https://example.com/${i}`,
  title: `Item ${i}`,
  description: `Description for item ${i}`,
  tags: [`tag${i % 3}`],
  dateBookmarked: "2024-01-01T00:00:00.000Z",
  sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
}));

describe("usePagination", () => {
  const mockUseSWRInfinite = useSWRInfinite as jest.MockedFunction<typeof useSWRInfinite>;
  const mockApiUrl = "/api/test-items";

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

    const { result } = renderHook(() => usePagination({ apiUrl: mockApiUrl }));

    expect(result.current.currentPage).toBe(1);
    expect(result.current.items).toEqual([]);
    expect(result.current.totalPages).toBe(0);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeUndefined();
  });

  it("processes paginated data correctly", () => {
    const mockData: PaginatedResponse<UnifiedBookmark>[] = [
      {
        data: mockItems.slice(0, 24),
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

    const { result } = renderHook(() => usePagination<UnifiedBookmark>({ apiUrl: mockApiUrl, limit: 24 }));

    expect(result.current.items).toHaveLength(24);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.totalItems).toBe(50);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it("loads more pages when requested", () => {
    const mockSetSize = jest.fn();
    const mockData: PaginatedResponse<UnifiedBookmark>[] = [
      {
        data: mockItems.slice(0, 24),
        meta: {
          pagination: { page: 1, limit: 24, total: 50, totalPages: 3, hasNext: true, hasPrev: false },
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

    const { result } = renderHook(() => usePagination({ apiUrl: mockApiUrl }));

    act(() => {
      result.current.loadMore();
    });

    expect(mockSetSize).toHaveBeenCalledWith(2);
  });

  it("navigates to specific page", () => {
    const mockSetSize = jest.fn();
     const mockData: PaginatedResponse<UnifiedBookmark>[] = [
      {
        data: mockItems.slice(0, 24),
        meta: {
          pagination: { page: 1, limit: 24, total: 50, totalPages: 3, hasNext: true, hasPrev: false },
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

    const { result } = renderHook(() => usePagination({ apiUrl: mockApiUrl }));

    act(() => {
      result.current.goToPage(3);
    });

    expect(result.current.currentPage).toBe(3);
    expect(mockSetSize).toHaveBeenCalledWith(3);
  });

  it("handles errors gracefully", () => {
    const mockError = new Error("Failed to fetch items");

    mockUseSWRInfinite.mockReturnValue({
      data: undefined,
      error: mockError,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: false,
    } as any);

    const { result } = renderHook(() => usePagination({ apiUrl: mockApiUrl }));

    expect(result.current.error).toBe(mockError);
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it("uses fallback data when provided", () => {
    const initialItems = mockItems.slice(0, 10);

    mockUseSWRInfinite.mockImplementation((_getKey, _fetcher, options) => {
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
      usePagination<UnifiedBookmark>({
        apiUrl: mockApiUrl,
        initialData: initialItems,
      }),
    );

    expect(result.current.items).toHaveLength(10);
  });

  it("constructs correct URL with queryParams", () => {
    mockUseSWRInfinite.mockReturnValue({
      data: undefined,
      error: undefined,
      size: 1,
      setSize: jest.fn(),
      mutate: jest.fn(),
      isValidating: false,
      isLoading: true,
    } as any);

    renderHook(() => usePagination({ 
      apiUrl: mockApiUrl, 
      queryParams: { tag: "test", sort: "desc" } 
    }));

    // Get the getKey function passed to SWR
    const getKey = mockUseSWRInfinite.mock.calls[0][0];
    
    // Call it to get the URL
    const url = getKey(0, null);

    expect(url).toBe("/api/test-items?page=1&limit=24&tag=test&sort=desc");
  });
});