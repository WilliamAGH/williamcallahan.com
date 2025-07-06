import { render, screen, fireEvent } from "@testing-library/react";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import { useBookmarksPagination } from "@/hooks/use-bookmarks-pagination";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import "@testing-library/jest-dom";

// Mock the pagination hook so we have deterministic state without network
jest.mock("@/hooks/use-bookmarks-pagination");

// Mock next/navigation's router
jest.mock("next/navigation", () => {
  const push = jest.fn();
  return {
    useRouter: () => ({ push, refresh: jest.fn() }),
  };
});

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

  const defaultHookReturn = {
    bookmarks: mockBookmarks,
    currentPage: 1,
    totalPages: 3,
    totalItems: 66,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: undefined,
    loadMore: jest.fn(),
    goToPage: jest.fn(),
    mutate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useBookmarksPagination as jest.Mock).mockReturnValue({ ...defaultHookReturn });
  });

  it("changes visible slice when page button clicked in search mode", async () => {
    render(
      <BookmarksWithPagination
        bookmarks={mockBookmarks.slice(0, 24)}
        showFilterBar={true}
        initialPage={1}
        itemsPerPage={24}
      />,
    );

    // Type search term to switch into search mode (bypasses fetch because mock data already there)
    fireEvent.change(screen.getByPlaceholderText(/search bookmarks/i), { target: { value: "ai" } });

    // Wait until new pagination controls appear (should show page 3 link)
    await screen.findByLabelText("Go to page 3");

    // Click page 2 button
    fireEvent.click(screen.getByLabelText("Go to page 2"));

    // goToPage should be called with 2
    expect(useBookmarksPagination().goToPage).toHaveBeenCalledWith(2);
  });
});
