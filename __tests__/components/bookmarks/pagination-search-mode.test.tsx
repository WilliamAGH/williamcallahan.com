import { render, screen, waitFor } from "@testing-library/react";
import { BookmarksWithPagination } from "@/components/features/bookmarks/bookmarks-with-pagination.client";
import { vi } from "vitest";
import type { UnifiedBookmark } from "@/types";

// Mock next/navigation's router
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/bookmarks",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the pagination hook
const { mockUsePagination } = vi.hoisted(() => ({
  mockUsePagination: vi.fn(),
}));

vi.mock("@/hooks/use-pagination", () => ({
  usePagination: mockUsePagination,
}));

const buildBookmarks = (count: number): UnifiedBookmark[] =>
  Array.from({ length: count }).map(
    (_, i) =>
      ({
        id: `${i}`,
        url: `https://example.com/${i}`,
        title: `AI Post ${i}`,
        description: "demo",
        slug: `ai-post-${i}`,
        tags: ["ai"],
        dateBookmarked: "2024-01-01T00:00:00.000Z",
        sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
      }) as UnifiedBookmark,
  );

describe("Search-mode client pagination", () => {
  const mockBookmarks = buildBookmarks(66);

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePagination.mockClear();

    // Mock the hook to return different values based on the current state
    let currentPage = 1;

    const goToPageMock = vi.fn((page: number) => {
      currentPage = page;
    });

    mockUsePagination.mockImplementation(() => ({
      items: mockBookmarks.slice((currentPage - 1) * 24, currentPage * 24),
      currentPage,
      totalPages: 3,
      totalItems: 66,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: undefined,
      loadMore: vi.fn(),
      goToPage: goToPageMock,
      mutate: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders bookmarks and displays pagination info", async () => {
    // Note: Search is handled via sitewide terminal, not component-level input.
    // This test validates rendering and pagination display.
    const { container } = render(
      <BookmarksWithPagination
        bookmarks={mockBookmarks.slice(0, 24)}
        showFilterBar={true}
        initialPage={1}
        itemsPerPage={24}
        totalPages={3}
        totalCount={66}
      />,
    );

    // Wait for component to mount (hydration)
    await waitFor(() => {
      // Verify pagination info is displayed (appears in multiple places: pagination control and results count)
      const showingElements = screen.getAllByText(/showing/i);
      expect(showingElements.length).toBeGreaterThan(0);
    });

    // Verify tag filter is shown when showFilterBar is true
    expect(screen.getByText(/filter by/i)).toBeInTheDocument();

    // The component should show bookmark placeholders or cards
    const bookmarkElements = container.querySelectorAll('[class*="rounded-3xl"]');
    expect(bookmarkElements.length).toBeGreaterThan(0);
  });
});
