import React, { act } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import type { DiscoverFeedWrapperProps } from "@/types/features/discovery";
import type { BookmarksIndex } from "@/types/schemas/bookmark";

type BookmarksDataAccess = typeof import("@/lib/bookmarks/bookmarks-data-access.server");
type BookmarkService = typeof import("@/lib/bookmarks/service.server");
type NextNavigation = typeof import("next/navigation");
type DiscoveryGroupedQueries = typeof import("@/lib/db/queries/discovery-grouped");

const { bookmarksIndexFixture } = vi.hoisted(() => {
  const fixture: BookmarksIndex = {
    count: 1,
    totalPages: 1,
    pageSize: 24,
    lastModified: "2024-01-01T00:00:00.000Z",
    lastFetchedAt: 0,
    lastAttemptedAt: 0,
    checksum: "page-number-test",
  };
  return { bookmarksIndexFixture: fixture };
});

// Manually mock the entire data access layer for this test suite
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  __esModule: true,
  getBookmarksIndex: vi
    .fn<BookmarksDataAccess["getBookmarksIndex"]>()
    .mockResolvedValue(bookmarksIndexFixture),
  getBookmarksPage: vi.fn<BookmarksDataAccess["getBookmarksPage"]>().mockResolvedValue([]),
  getTagBookmarksPage: vi.fn<BookmarksDataAccess["getTagBookmarksPage"]>().mockResolvedValue([]),
  getTagBookmarksIndex: vi
    .fn<BookmarksDataAccess["getTagBookmarksIndex"]>()
    .mockResolvedValue({ ...bookmarksIndexFixture, count: 0 }),
}));

// Mock the service layer (this is what the page component imports from)
const {
  mockGetBookmarks,
  mockGetBookmarksIndex,
  mockGetBookmarksPage,
  mockResolveBookmarkTagSlug,
  mockGetBookmarksByTag,
} = vi.hoisted(() => ({
  mockGetBookmarks: vi.fn<BookmarkService["getBookmarks"]>().mockResolvedValue([]),
  mockGetBookmarksIndex: vi
    .fn<BookmarkService["getBookmarksIndex"]>()
    .mockResolvedValue(bookmarksIndexFixture),
  mockGetBookmarksPage: vi.fn<BookmarkService["getBookmarksPage"]>().mockResolvedValue([]),
  mockResolveBookmarkTagSlug: vi.fn<BookmarkService["resolveBookmarkTagSlug"]>(),
  mockGetBookmarksByTag: vi.fn<BookmarkService["getBookmarksByTag"]>(),
}));

const { mockGetDiscoveryGroupedBookmarks } = vi.hoisted(() => ({
  mockGetDiscoveryGroupedBookmarks: vi
    .fn<DiscoveryGroupedQueries["getDiscoveryGroupedBookmarks"]>()
    .mockResolvedValue({
      recentlyAdded: [],
      topicSections: [],
      internalHrefs: {},
      pagination: {
        sectionPage: 1,
        sectionsPerPage: 2,
        totalSections: 0,
        hasNextSectionPage: false,
        nextSectionPage: null,
      },
      degradation: {
        isDegraded: false,
        reasons: [],
      },
    }),
}));

vi.mock("@/lib/bookmarks/service.server", () => ({
  __esModule: true,
  getBookmarks: mockGetBookmarks,
  getBookmarksIndex: mockGetBookmarksIndex,
  getBookmarksPage: mockGetBookmarksPage,
  resolveBookmarkTagSlug: mockResolveBookmarkTagSlug,
  getBookmarksByTag: mockGetBookmarksByTag,
}));

const { mockRedirect, mockNotFound } = vi.hoisted(() => ({
  mockRedirect: vi.fn<NextNavigation["redirect"]>((url) => {
    throw new Error(`redirect:${url}`);
  }),
  mockNotFound: vi.fn<NextNavigation["notFound"]>(() => {
    throw new Error("notFound");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}));

vi.mock("@/components/features/bookmarks/bookmarks.server", () => ({
  __esModule: true,
  BookmarksServer: () => <div data-testid="bookmarks-server" />,
}));

vi.mock("@/components/features/bookmarks/discover-feed.client", () => ({
  __esModule: true,
  DiscoverFeed: () => <div data-testid="discover-feed" />,
}));

vi.mock("@/components/features/bookmarks/discover-feed-wrapper.server", () => {
  return {
    __esModule: true,
    DiscoverFeedWrapper: (props: DiscoverFeedWrapperProps) => {
      // Call it synchronously to register the invocation for vitest
      mockGetDiscoveryGroupedBookmarks({
        sectionPage: props.sectionPage,
        sectionsPerPage: props.sectionsPerPage,
        recencyDays: props.recencyDays,
      });
      return <div data-testid="discover-feed" />;
    },
    DiscoverFeedSkeleton: () => <div data-testid="discover-feed-skeleton" />,
  };
});

vi.mock("@/lib/db/queries/discovery-grouped", () => ({
  __esModule: true,
  getDiscoveryGroupedBookmarks: mockGetDiscoveryGroupedBookmarks,
}));

type RootPageComponentType = typeof import("@/app/bookmarks/page").default;
let RootPage: RootPageComponentType;
type TagPageComponentType = typeof import("@/app/bookmarks/tags/[...slug]/page").default;
let TagPage: TagPageComponentType;

function assertReactElement(node: React.ReactNode): React.ReactElement {
  if (!React.isValidElement(node)) {
    throw new Error("Expected a React element");
  }
  return node;
}

describe("Bookmarks Root Feed", () => {
  beforeAll(async () => {
    const rootPageModule = await import("@/app/bookmarks/page");
    RootPage = rootPageModule.default;
    const tagPageModule = await import("@/app/bookmarks/tags/[...slug]/page");
    TagPage = tagPageModule.default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders discover layout by default on /bookmarks", async () => {
    const RootComponent = RootPage({
      searchParams: Promise.resolve({}),
    });

    const { container } = await act(() => render(assertReactElement(RootComponent)));

    expect(container.querySelector('[data-testid="discover-feed"]')).not.toBeNull();
    expect(mockGetDiscoveryGroupedBookmarks).toHaveBeenCalled();
    expect(mockGetDiscoveryGroupedBookmarks).toHaveBeenCalledWith({
      sectionPage: 1,
      sectionsPerPage: 2,
      recencyDays: 90,
    });
  });

  it("renders latest feed via BookmarksServer when feed=latest", async () => {
    const RootComponent = RootPage({
      searchParams: Promise.resolve({ feed: "latest" }),
    });

    const { container } = await act(() => render(assertReactElement(RootComponent)));

    expect(container.querySelector('[data-testid="bookmarks-server"]')).not.toBeNull();
    expect(mockGetDiscoveryGroupedBookmarks).not.toHaveBeenCalled();
  });

  it("redirects unknown tags to /bookmarks", async () => {
    mockResolveBookmarkTagSlug.mockResolvedValueOnce({
      requestedSlug: "nonexistent",
      canonicalSlug: "nonexistent",
      canonicalTagName: null,
      isAlias: false,
    });

    await expect(
      TagPage({
        params: Promise.resolve({ slug: ["nonexistent"] }),
      }),
    ).rejects.toThrow("redirect:/bookmarks");

    expect(mockRedirect).toHaveBeenCalledWith("/bookmarks");
    expect(mockGetBookmarksByTag).not.toHaveBeenCalled();
  });
});
