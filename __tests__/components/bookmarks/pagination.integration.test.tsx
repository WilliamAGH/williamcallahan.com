import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import { useBookmarksPagination } from "@/hooks/use-bookmarks-pagination";
import type { UnifiedBookmark } from "@/types";
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import "@testing-library/jest-dom";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

jest.mock("next/navigation", () => {
  const push = jest.fn();
  const refresh = jest.fn();
  let pathname = "/bookmarks";
  return {
    // exported for test access without calling the hook
    __push: push,
    useRouter: () => ({ push, refresh }),
    usePathname: jest.fn(() => pathname),
    __changePath: (p: string) => {
      pathname = p;
    },
  };
});

jest.mock("@/hooks/use-bookmarks-pagination");

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

const mockPaginationHook = useBookmarksPagination as jest.Mock;
// Access the mocked module exports safely (jest.mock above is hoisted)
import * as mockNextNav from "next/navigation";

const mockRouter = {
  // Using `any` cast here is acceptable in tests to access dynamically mocked members
  push: (mockNextNav as any).push as jest.Mock,
  refresh: jest.fn(),
};
const setPathname = (path: string) => {
  mockNextNav.__changePath(path);
};

// Helper to setup hook return
function setupHook(page = 1, data: UnifiedBookmark[] = sixtySix) {
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

describe("BookmarksWithPagination – integrated paging", () => {
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

    // Click page 2 (use in-memory PaginationControl)
    fireEvent.click(screen.getByLabelText("Go to page 2"));

    await waitFor(() => {
      // Component should call goToPage with 2
      expect(mockPaginationHook().goToPage).toHaveBeenCalledWith(2);
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
    expect(mockRouter.push).toHaveBeenCalledWith("/bookmarks/tags/artificial-intelligence/page/3");
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

    expect(mockPaginationHook().goToPage).toHaveBeenCalledWith(1);
  });
});
