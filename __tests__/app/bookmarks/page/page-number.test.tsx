import React, { act } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";

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

const { mockGetDiscoveryGroupedBookmarks } = vi.hoisted(() => ({
  mockGetDiscoveryGroupedBookmarks: vi.fn().mockResolvedValue({
    recentlyAdded: [],
    topicSections: [],
    internalHrefs: {},
  }),
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

vi.mock("@/components/features/bookmarks/discover-feed.client", () => ({
  __esModule: true,
  DiscoverFeed: () => <div data-testid="discover-feed" />,
}));

vi.mock("@/lib/db/queries/discovery-grouped", () => ({
  __esModule: true,
  getDiscoveryGroupedBookmarks: mockGetDiscoveryGroupedBookmarks,
}));

type RootPageComponentType = typeof import("@/app/bookmarks/page").default;
let RootPage: RootPageComponentType;

describe("Bookmarks Root Feed", () => {
  beforeAll(async () => {
    const rootPageModule = await import("@/app/bookmarks/page");
    RootPage = rootPageModule.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders discover layout by default on /bookmarks", async () => {
    const RootComponent = await RootPage({
      searchParams: Promise.resolve({}),
    });

    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(RootComponent as React.ReactElement);
      container = rendered.container;
    });

    expect(container).toBeTruthy();
    expect(container?.querySelector('[data-testid="discover-feed"]')).not.toBeNull();
    expect(mockGetDiscoveryGroupedBookmarks).toHaveBeenCalledTimes(1);
  });

  it("renders latest feed via BookmarksServer when feed=latest", async () => {
    const RootComponent = await RootPage({
      searchParams: Promise.resolve({ feed: "latest" }),
    });

    let container: HTMLElement | null = null;
    await act(async () => {
      const rendered = render(RootComponent as React.ReactElement);
      container = rendered.container;
    });

    expect(container).toBeTruthy();
    expect(container?.querySelector('[data-testid="bookmarks-server"]')).not.toBeNull();
    expect(mockGetDiscoveryGroupedBookmarks).not.toHaveBeenCalled();
  });
});
