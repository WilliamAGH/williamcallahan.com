import React from "react";
import { vi, type Mock } from "vitest";
import { render } from "@testing-library/react";
import Page from "@/app/bookmarks/page/[pageNumber]/page";
import { usePathname } from "next/navigation";

// Manually mock the entire data access layer for this test suite
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  __esModule: true,
  getBookmarksIndex: vi.fn().mockResolvedValue({ count: 1, totalPages: 1 }),
  getBookmarksPage: vi.fn().mockResolvedValue([]),
  getTagBookmarksPage: vi.fn().mockResolvedValue([]),
  getTagBookmarksIndex: vi.fn().mockResolvedValue({ count: 0, totalPages: 1 }),
  setRefreshBookmarksCallback: vi.fn(),
  initializeBookmarksDataAccess: vi.fn(),
  cleanupBookmarksDataAccess: vi.fn(),
}));

// Mock the service layer (this is what the page component imports from)
const { mockGetBookmarks, mockGetBookmarksIndex, mockGetBookmarksPage } = vi.hoisted(() => ({
  mockGetBookmarks: vi.fn().mockResolvedValue([]),
  mockGetBookmarksIndex: vi.fn().mockResolvedValue({ count: 1, totalPages: 1 }),
  mockGetBookmarksPage: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/bookmarks/service.server", () => ({
  __esModule: true,
  getBookmarks: mockGetBookmarks,
  getBookmarksIndex: mockGetBookmarksIndex,
  getBookmarksPage: mockGetBookmarksPage,
}));

vi.mock("@/components/features/bookmarks/bookmarks.server", () => ({
  __esModule: true,
  BookmarksServer: () => <div data-testid="bookmarks-server" />,
}));

describe("Bookmarks PageNumber", () => {
  beforeEach(() => {
    (usePathname as Mock).mockReturnValue("/bookmarks/page/1");
    // Clear mocks before each test
    vi.clearAllMocks();
  });

  it("should render the bookmarks page without crashing", async () => {
    // Update the mock implementation for this test
    mockGetBookmarks.mockResolvedValue([
      { id: "1", title: "Test Bookmark", url: "https://example.com" },
    ]);

    // Call the async component as a function (workaround for Vitest with async Server Components)
    const PageComponent = await Page({ params: Promise.resolve({ pageNumber: "1" }) });

    // Render the JSX returned by the component
    const { container } = render(PageComponent as React.ReactElement);

    // Verify the component rendered
    expect(container).toBeTruthy();
  });

  it("should handle invalid page numbers gracefully", async () => {
    // Call the async component as a function (workaround for Vitest with async Server Components)
    const PageComponent = await Page({ params: Promise.resolve({ pageNumber: "invalid" }) });

    // Render the JSX returned by the component
    const { container } = render(PageComponent as React.ReactElement);

    // Verify the component rendered without crashing
    expect(container).toBeTruthy();
  });
});
