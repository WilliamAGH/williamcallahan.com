import { describe, expect, it, jest } from "@jest/globals";
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import Page from "@/app/bookmarks/page/[pageNumber]/page";
import { usePathname } from "next/navigation";

// Manually mock the entire data access layer for this test suite
jest.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  __esModule: true,
  getBookmarksIndex: jest.fn().mockResolvedValue({ count: 1, totalPages: 1 }),
  getBookmarksPage: jest.fn().mockResolvedValue([]),
  getTagBookmarksPage: jest.fn().mockResolvedValue([]),
  getTagBookmarksIndex: jest.fn().mockResolvedValue({ count: 0, totalPages: 1 }),
  setRefreshBookmarksCallback: jest.fn(),
  initializeBookmarksDataAccess: jest.fn(),
  cleanupBookmarksDataAccess: jest.fn(),
}));

// Mock the service layer
const mockGetBookmarks = jest.fn().mockResolvedValue([]);
jest.mock("@/lib/bookmarks/service.server", () => ({
  __esModule: true,
  getBookmarks: mockGetBookmarks,
}));

describe("Bookmarks PageNumber", () => {
  beforeEach(() => {
    (usePathname as jest.Mock).mockReturnValue("/bookmarks/page/1");
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  it("should render the bookmarks page without crashing", async () => {
    // Update the mock implementation for this test
    mockGetBookmarks.mockResolvedValue([{ id: "1", title: "Test Bookmark", url: "https://example.com" }]);

    // Call the async component as a function (workaround for Jest with async components)
    const PageComponent = await Page({ params: { pageNumber: "1" } });

    // Render the JSX returned by the component
    const { container } = render(PageComponent as React.ReactElement);

    // Verify the component rendered
    expect(container).toBeTruthy();
  });

  it("should handle invalid page numbers gracefully", async () => {
    // Call the async component as a function (workaround for Jest with async components)
    const PageComponent = await Page({ params: { pageNumber: "invalid" } });

    // Render the JSX returned by the component
    const { container } = render(PageComponent as React.ReactElement);

    // Verify the component rendered without crashing
    expect(container).toBeTruthy();
  });
});
