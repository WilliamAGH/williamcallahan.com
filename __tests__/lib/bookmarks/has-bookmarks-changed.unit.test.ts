import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedBookmark } from "@/types";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";

const mockGetBookmarksIndexFromDatabase = vi.fn();
const mockGetAllBookmarks = vi.fn();
const mockRebuildBookmarkTaxonomyState = vi.fn();
const mockWriteBookmarkMasterFiles = vi.fn();
const mockProcessBookmarksInBatches = vi.fn();
const mockSaveSlugMapping = vi.fn();
const mockGenerateSlugMapping = vi.fn();

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: (...args: unknown[]) => mockGetBookmarksIndexFromDatabase(...args),
  getAllBookmarks: (...args: unknown[]) => mockGetAllBookmarks(...args),
}));

vi.mock("@/lib/db/mutations/bookmarks", () => ({
  rebuildBookmarkTaxonomyState: (...args: unknown[]) => mockRebuildBookmarkTaxonomyState(...args),
}));

vi.mock("@/lib/bookmarks/persistence.server", () => ({
  writeBookmarkMasterFiles: (...args: unknown[]) => mockWriteBookmarkMasterFiles(...args),
}));

vi.mock("@/lib/bookmarks/enrich-opengraph", () => ({
  processBookmarksInBatches: (...args: unknown[]) => mockProcessBookmarksInBatches(...args),
}));

vi.mock("@/lib/bookmarks/slug-manager", () => ({
  saveSlugMapping: (...args: unknown[]) => mockSaveSlugMapping(...args),
  generateSlugMapping: (...args: unknown[]) => mockGenerateSlugMapping(...args),
}));

import * as bookmarksModule from "@/lib/bookmarks/refresh-logic.server";

function buildBookmark(id: string): UnifiedBookmark {
  const timestamp = "2024-01-01T00:00:00.000Z";
  return {
    id,
    slug: `bookmark-${id}`,
    url: `https://example.com/${id}`,
    title: `Bookmark ${id}`,
    description: `Description ${id}`,
    tags: [],
    dateBookmarked: timestamp,
    sourceUpdatedAt: timestamp,
  } as UnifiedBookmark;
}

function buildSlugMapping(bookmarks: UnifiedBookmark[]) {
  const slugs = Object.fromEntries(
    bookmarks.map((bookmark) => [
      bookmark.id,
      {
        id: bookmark.id,
        slug: bookmark.slug,
        url: bookmark.url,
        title: bookmark.title,
      },
    ]),
  );
  const reverseMap = Object.fromEntries(
    bookmarks.map((bookmark) => [bookmark.slug ?? "", bookmark.id]),
  );

  return {
    version: "1.0.0",
    generated: new Date().toISOString(),
    count: bookmarks.length,
    checksum: "slug-checksum",
    slugs,
    reverseMap,
  };
}

describe("refresh change-detection behavior (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SELECTIVE_OG_REFRESH = "true";

    mockGetAllBookmarks.mockResolvedValue([]);
    mockRebuildBookmarkTaxonomyState.mockResolvedValue(undefined);
    mockWriteBookmarkMasterFiles.mockResolvedValue(undefined);
    mockProcessBookmarksInBatches.mockImplementation((bookmarks: UnifiedBookmark[]) =>
      Promise.resolve(bookmarks),
    );
    mockSaveSlugMapping.mockResolvedValue(undefined);
    mockGenerateSlugMapping.mockImplementation((bookmarks: UnifiedBookmark[]) =>
      buildSlugMapping(bookmarks),
    );
  });

  afterEach(() => {
    bookmarksModule.cleanupBookmarksDataAccess();
  });

  it("persists when no prior index-state exists", async () => {
    const dataset = [buildBookmark("a")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 0,
      checksum: "count:0",
    });

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("persists when bookmark count changes", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b"), buildBookmark("c")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 5,
      checksum: "old-checksum",
    });

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("persists when checksum changes with equal count", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 2,
      checksum: "different-checksum",
    });

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("rebuilds index-state without full rewrite when dataset is unchanged", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 2,
      checksum: calculateBookmarksChecksum(dataset),
    });

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockRebuildBookmarkTaxonomyState).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).toHaveBeenCalledWith(dataset, false);
    expect(mockWriteBookmarkMasterFiles).not.toHaveBeenCalled();
  });

  it("defaults to persist when index-state count is stale", async () => {
    const dataset = [buildBookmark("a")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 2,
      checksum: calculateBookmarksChecksum(dataset),
    });

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });
});
