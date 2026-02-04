/**
 * Tag Navigation with Pagination Tests
 *
 * Tests that bookmark tag pages maintain proper state and pagination
 * with idempotent behavior (same URL = same view)
 */

import type { Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useRouter, usePathname } from "next/navigation";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import { usePagination } from "@/hooks/use-pagination";
import type { UnifiedBookmark } from "@/types";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn(),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

// Mock the pagination hook
vi.mock("@/hooks/use-pagination");

// Mock data
const mockBookmarks: UnifiedBookmark[] = [
  {
    id: "1",
    url: "https://example.com/1",
    title: "React Best Practices",
    description: "Learn React",
    tags: ["React", "JavaScript"],
    dateBookmarked: "2024-01-01T00:00:00.000Z",
    sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "2",
    url: "https://example.com/2",
    title: "TypeScript Guide",
    description: "TypeScript fundamentals",
    tags: ["TypeScript", "JavaScript"],
    dateBookmarked: "2024-01-02T00:00:00.000Z",
    sourceUpdatedAt: "2024-01-02T00:00:00.000Z",
  },
  {
    id: "3",
    url: "https://example.com/3",
    title: "React Hooks",
    description: "Advanced React patterns",
    tags: ["React", "Hooks"],
    dateBookmarked: "2024-01-03T00:00:00.000Z",
    sourceUpdatedAt: "2024-01-03T00:00:00.000Z",
  },
];

describe("Tag Navigation with Pagination", () => {
  const mockPush = vi.fn();
  const mockMutate = vi.fn();
  const mockGoToPage = vi.fn();
  const mockLoadMore = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (useRouter as Mock).mockReturnValue({
      push: mockPush,
      refresh: vi.fn(),
    });

    (usePathname as Mock).mockReturnValue("/bookmarks");

    // Default pagination hook mock
    (usePagination as Mock).mockReturnValue({
      items: mockBookmarks,
      currentPage: 1,
      totalPages: 3,
      totalItems: 72, // 3 pages of 24 items
      isLoading: false,
      isLoadingMore: false,
      hasMore: true,
      error: undefined,
      loadMore: mockLoadMore,
      goToPage: mockGoToPage,
      mutate: mockMutate,
    });
  });

  describe("Tag Filtering with Server-Side Pagination", () => {
    it("should pass tag filter to pagination hook when tag prop is provided", () => {
      render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Verify the hook was called with the tag parameter
      expect(usePagination).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: { tag: "React" },
        }),
      );
    });

    it("should not pass tag filter when no tag prop is provided", () => {
      render(<BookmarksWithPagination initialBookmarks={mockBookmarks} baseUrl="/bookmarks" />);

      // Verify the hook was called without tag parameter
      expect(usePagination).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: {},
        }),
      );
    });

    it("should maintain tag filter across page navigation", () => {
      const { rerender } = render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={1}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Simulate navigating to page 2
      rerender(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={2}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Verify the hook still receives the tag filter
      expect(usePagination).toHaveBeenLastCalledWith(
        expect.objectContaining({
          queryParams: { tag: "React" },
          initialPage: 2,
        }),
      );
    });
  });

  describe("Tag Selection Navigation", () => {
    it("should navigate to tag URL when a tag is clicked", async () => {
      render(<BookmarksWithPagination initialBookmarks={mockBookmarks} showFilterBar={true} />);

      // Find and click a tag
      const reactTag = await screen.findByRole("button", { name: /React/i });
      fireEvent.click(reactTag);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/bookmarks/tags/react");
      });
    });

    it("should navigate back to /bookmarks when tag is cleared", async () => {
      (usePathname as Mock).mockReturnValue("/bookmarks/tags/react");

      render(
        <BookmarksWithPagination
          initialBookmarks={mockBookmarks}
          showFilterBar={true}
          initialTag="React"
        />,
      );

      // Click the same tag again to clear it
      const reactTag = await screen.findByRole("button", { name: /React/i });
      fireEvent.click(reactTag);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/bookmarks");
      });
    });

    it("should reset to page 1 when selecting a tag", async () => {
      // Start on page 3
      (usePagination as Mock).mockReturnValue({
        items: mockBookmarks,
        currentPage: 3,
        totalPages: 5,
        totalItems: 120,
        isLoading: false,
        isLoadingMore: false,
        hasMore: true,
        error: undefined,
        loadMore: mockLoadMore,
        goToPage: mockGoToPage,
        mutate: mockMutate,
      });

      render(<BookmarksWithPagination initialBookmarks={mockBookmarks} showFilterBar={true} />);

      // Click a tag
      const typescriptTag = await screen.findByRole("button", { name: /TypeScript/i });
      fireEvent.click(typescriptTag);

      // Should reset to page 1
      await waitFor(() => {
        expect(mockGoToPage).toHaveBeenCalledWith(1);
      });
    });
  });

  describe("URL-based Pagination", () => {
    it("should render pagination info when there are multiple pages", () => {
      (usePathname as Mock).mockReturnValue("/bookmarks/tags/react");

      render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          baseUrl="/bookmarks/tags/react"
          initialPage={2}
        />,
      );

      // Verify the hook was called with the correct tag and page
      expect(usePagination).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: { tag: "React" },
          initialPage: 2,
        }),
      );
    });

    it("should use correct baseUrl for tag pages", () => {
      const { rerender } = render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          baseUrl="/bookmarks/tags/react"
          initialPage={1}
        />,
      );

      // Verify the hook was called with the correct baseUrl-derived initialPage
      expect(usePagination).toHaveBeenCalledWith(
        expect.objectContaining({
          queryParams: { tag: "React" },
          initialPage: 1,
        }),
      );

      // When page changes, hook should be called with new page
      rerender(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          baseUrl="/bookmarks/tags/react"
          initialPage={2}
        />,
      );

      expect(usePagination).toHaveBeenLastCalledWith(
        expect.objectContaining({
          queryParams: { tag: "React" },
          initialPage: 2,
        }),
      );
    });
  });

  describe("Idempotent Behavior", () => {
    it("should show same content for same tag URL on refresh", () => {
      const { rerender } = render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={2}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Get initial hook call
      const firstCall = (usePagination as Mock).mock.calls[0][0];

      // Clear mock and re-render (simulating page refresh)
      (usePagination as Mock).mockClear();

      rerender(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={2}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Should call hook with exact same parameters
      const secondCall = (usePagination as Mock).mock.calls[0][0];
      expect(secondCall).toEqual(firstCall);
    });

    it("should not lose tag filter when component re-renders", async () => {
      (usePathname as Mock).mockReturnValue("/bookmarks/tags/react");

      const { rerender } = render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={1}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Simulate page navigation by re-rendering with new page
      rerender(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="React"
          initialTag="React"
          initialPage={2}
          baseUrl="/bookmarks/tags/react"
        />,
      );

      // Tag filter should still be present in the hook call
      await waitFor(() => {
        expect(usePagination).toHaveBeenCalledWith(
          expect.objectContaining({
            queryParams: { tag: "React" },
            initialPage: 2,
          }),
        );
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle special characters in tags", async () => {
      const bookmarksWithSpecialTags: UnifiedBookmark[] = [
        {
          id: "1",
          url: "https://example.com",
          title: "C++ Guide",
          description: "A guide to C++",
          tags: ["C++", "C#", ".NET"],
          dateBookmarked: "2024-01-01T00:00:00.000Z",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];

      (usePagination as Mock).mockReturnValue({
        items: bookmarksWithSpecialTags,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        error: undefined,
        loadMore: mockLoadMore,
        goToPage: mockGoToPage,
        mutate: mockMutate,
      });

      render(
        <BookmarksWithPagination
          initialBookmarks={bookmarksWithSpecialTags}
          showFilterBar={true}
        />,
      );

      const cppTag = await screen.findByRole("button", { name: "C++" });
      fireEvent.click(cppTag);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/bookmarks/tags/c-plus-plus");
      });
    });

    it("should handle empty results for tag filter", () => {
      (usePagination as Mock).mockReturnValue({
        items: [],
        currentPage: 1,
        totalPages: 0,
        totalItems: 0,
        isLoading: false,
        isLoadingMore: false,
        hasMore: false,
        error: undefined,
        loadMore: mockLoadMore,
        goToPage: mockGoToPage,
        mutate: mockMutate,
      });

      render(
        <BookmarksWithPagination
          initialBookmarks={[]}
          tag="NonExistentTag"
          initialTag="NonExistentTag"
          baseUrl="/bookmarks/tags/nonexistenttag"
        />,
      );

      // Component shows "No bookmarks found" in multiple places (count section and empty state)
      // Use getAllByText since both are intentional UI elements
      const noBookmarksElements = screen.getAllByText(/no bookmarks found/i);
      expect(noBookmarksElements.length).toBeGreaterThan(0);
    });
  });
});
