import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import "@testing-library/jest-dom";

// Mock next/navigation's router
jest.mock("next/navigation", () => {
  const push = jest.fn();
  return {
    useRouter: () => ({ push, refresh: jest.fn() }),
    usePathname: () => "/bookmarks",
    useSearchParams: () => new URLSearchParams(),
  };
});

// Mock the pagination hook so we have deterministic state without network
jest.mock("@/hooks/use-bookmarks-pagination", () => ({
  useBookmarksPagination: jest.fn(),
}));

const buildBookmarks = (count: number) =>
  Array.from({ length: count }).map((_, i) => ({
    id: `${i}`,
    url: `https://example.com/${i}`,
    title: `AI Post ${i}`,
    description: "demo",
    tags: ["ai"],
    dateBookmarked: "2024-01-01",
  }));

describe("Search-mode client pagination", () => {
  const mockBookmarks = buildBookmarks(66);

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock the hook to return different values based on the current state
    const { useBookmarksPagination } = require("@/hooks/use-bookmarks-pagination");
    let currentPage = 1;

    const goToPageMock = jest.fn((page: number) => {
      currentPage = page;
    });

    useBookmarksPagination.mockImplementation(() => ({
      bookmarks: mockBookmarks.slice((currentPage - 1) * 24, currentPage * 24),
      currentPage,
      totalPages: 3,
      totalItems: 66,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: undefined,
      loadMore: jest.fn(),
      goToPage: goToPageMock,
      mutate: jest.fn(),
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders bookmarks and handles search", async () => {
    // Mock fetch for search API to return all 66 bookmarks
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockBookmarks }),
      }),
    ) as jest.Mock;

    const { container } = render(
      <BookmarksWithPagination
        initialBookmarks={mockBookmarks.slice(0, 24)}
        showFilterBar={true}
        initialPage={1}
        itemsPerPage={24}
        totalPages={3}
        totalCount={66}
      />,
    );

    // Helper to check for text in the component
    const findText = (text: string) => {
      const elements = container.querySelectorAll("*");
      return Array.from(elements).some((el) => el.textContent?.includes(text));
    };

    // Verify initial state shows some bookmarks
    expect(screen.getByPlaceholderText(/search bookmarks/i)).toBeInTheDocument();

    // Type search term
    fireEvent.change(screen.getByPlaceholderText(/search bookmarks/i), { target: { value: "ai" } });

    // Wait for search to be triggered
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/search/bookmarks?q=ai"),
        expect.any(Object),
      );
    });

    // Verify search results are displayed
    await waitFor(() => {
      expect(findText("for ai")).toBe(true);
    });

    // The component should show bookmarks
    const bookmarkElements = container.querySelectorAll('[class*="rounded-3xl"]');
    expect(bookmarkElements.length).toBeGreaterThan(0);
  });
});
