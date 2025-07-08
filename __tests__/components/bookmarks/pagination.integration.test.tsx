import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import type { UnifiedBookmark } from "@/types";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import "@testing-library/jest-dom";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Store pathname outside to allow modification
let mockPathname = "/bookmarks";

// Define router stubs in the module scope so they are shared between the mock
// factory and the individual test assertions—without exporting anything (tests
// should not have exports).
const push = jest.fn();
const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  // Mocked hook – used *inside* components only (safe for hooks-rules)
  useRouter: () => ({ push, refresh }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/hooks/use-bookmarks-pagination", () => ({
  useBookmarksPagination: jest.fn(),
}));

// Minimal bookmark factory
const createBookmark = (i: number): UnifiedBookmark => ({
  id: `b${i}`,
  url: `https://example.com/${i}`,
  title: `Bookmark ${i}`,
  description: `Desc ${i}`,
  tags: ["ai"],
  dateBookmarked: "2024-01-01",
});

const sixtySix = Array.from({ length: 66 }, (_, i) => createBookmark(i));

// Helper to update pathname
const setPathname = (path: string) => {
  mockPathname = path;
};

// Helper to setup hook return
function setupHook(page = 1, data: UnifiedBookmark[] = sixtySix) {
  const mockPaginationHook = require("@/hooks/use-bookmarks-pagination").useBookmarksPagination;
  mockPaginationHook.mockReturnValue({
    bookmarks: data,
    currentPage: page,
    totalPages: Math.ceil(data.length / 24),
    totalItems: data.length,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: undefined,
    loadMore: jest.fn(),
    goToPage: jest.fn(),
    mutate: jest.fn(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe.skip("BookmarksWithPagination – integrated paging", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setPathname("/bookmarks");
  });

  it("slices client search results when navigating pages", async () => {
    setupHook(1);

    render(
      <BookmarksWithPagination
        initialBookmarks={sixtySix}
        bookmarks={sixtySix}
        showFilterBar={false}
        itemsPerPage={24}
      />,
    );

    // Page 1 should show first bookmark
    expect(screen.getByText("Bookmark 0")).toBeInTheDocument();

    // Click page 2 (use in-memory PaginationControl) - get first one if multiple
    const page2Buttons = screen.getAllByLabelText("Go to page 2");
    fireEvent.click(page2Buttons[0]);

    await waitFor(() => {
      // Component should call goToPage with 2
      const { useBookmarksPagination } = require("@/hooks/use-bookmarks-pagination");
      const hookReturn = useBookmarksPagination.mock.results[0].value;
      expect(hookReturn.goToPage).toHaveBeenCalledWith(2);
    });
  });

  it("generates correct URL for tag page pagination", () => {
    setupHook(1);
    render(
      <BookmarksWithPagination
        bookmarks={sixtySix}
        initialBookmarks={sixtySix}
        showFilterBar={false}
        itemsPerPage={24}
        tag="Artificial Intelligence"
        baseUrl="/bookmarks/tags/artificial-intelligence"
      />,
    );

    fireEvent.click(screen.getByLabelText("Go to page 3"));
    expect(push).toHaveBeenCalledWith("/bookmarks/tags/artificial-intelligence/page/3");
  });

  it("resets to page 1 when clearing search", () => {
    setupHook(3);
    render(
      <BookmarksWithPagination
        bookmarks={sixtySix}
        initialBookmarks={sixtySix}
        showFilterBar={false}
        itemsPerPage={24}
        initialPage={3}
      />,
    );

    // Simulate clearing search by dispatching event
    fireEvent.change(screen.getByPlaceholderText(/search bookmarks/i), { target: { value: "" } });

    const { useBookmarksPagination } = require("@/hooks/use-bookmarks-pagination");
    const hookReturn = useBookmarksPagination.mock.results[0].value;
    expect(hookReturn.goToPage).toHaveBeenCalledWith(1);
  });
});
