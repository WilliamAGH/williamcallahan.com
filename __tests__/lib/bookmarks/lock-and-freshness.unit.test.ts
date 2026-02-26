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

describe("Bookmarks lock + freshness behavior (unit)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    process.env.MIN_BOOKMARKS_THRESHOLD = "1";
    process.env.NODE_ENV = "test";
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

  it("acquires/releases local lock and refreshes index-state on unchanged data", async () => {
    const {
      acquireRefreshLock,
      releaseRefreshLock,
      setRefreshBookmarksCallback,
      refreshAndPersistBookmarks,
      initializeBookmarksDataAccess,
      cleanupBookmarksDataAccess,
    } = await import("../../../src/lib/bookmarks/refresh-logic.server");

    const dataset = [buildBookmark("a")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      count: 1,
      checksum: calculateBookmarksChecksum(dataset),
    });

    setRefreshBookmarksCallback(() => dataset);
    initializeBookmarksDataAccess();

    expect(await acquireRefreshLock()).toBe(true);
    expect(await acquireRefreshLock()).toBe(false);
    await releaseRefreshLock();

    const result = await refreshAndPersistBookmarks(false);
    cleanupBookmarksDataAccess();

    expect(result).toEqual(dataset);
    expect(mockRebuildBookmarkTaxonomyState).toHaveBeenCalledTimes(1);
    expect(mockWriteBookmarkMasterFiles).not.toHaveBeenCalled();
    expect(await acquireRefreshLock()).toBe(true);
    await releaseRefreshLock();
  });
});
