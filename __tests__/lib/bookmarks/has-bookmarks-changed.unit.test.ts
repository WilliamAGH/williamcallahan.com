import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookmarkSlugMapping,
  BookmarkSlugSource,
  BookmarksIndex,
  UnifiedBookmark,
} from "@/types/schemas/bookmark";
import type { getAllBookmarks, getBookmarksIndexFromDatabase } from "@/lib/db/queries/bookmarks";
import type { rebuildBookmarkTaxonomyState } from "@/lib/db/mutations/bookmarks";
import type {
  backfillDueBookmarkEmbeddings,
  writeBookmarkMasterFiles,
} from "@/lib/bookmarks/persistence.server";
import type { processBookmarksInBatches } from "@/lib/bookmarks/enrich-opengraph";
import type { generateSlugMapping, saveSlugMapping } from "@/lib/bookmarks/slug-manager";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";

const mockGetBookmarksIndexFromDatabase = vi.fn<typeof getBookmarksIndexFromDatabase>();
const mockGetAllBookmarks = vi.fn<typeof getAllBookmarks>();
const mockRebuildBookmarkTaxonomyState = vi.fn<typeof rebuildBookmarkTaxonomyState>();
const mockWriteBookmarkMasterFiles = vi.fn<typeof writeBookmarkMasterFiles>();
const mockBackfillDueBookmarkEmbeddings = vi.fn<typeof backfillDueBookmarkEmbeddings>();
const mockProcessBookmarksInBatches = vi.fn<typeof processBookmarksInBatches>();
const mockSaveSlugMapping = vi.fn<typeof saveSlugMapping>();
const mockGenerateSlugMapping = vi.fn<typeof generateSlugMapping>();

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: (...args: Parameters<typeof getBookmarksIndexFromDatabase>) =>
    mockGetBookmarksIndexFromDatabase(...args),
  getAllBookmarks: (...args: Parameters<typeof getAllBookmarks>) => mockGetAllBookmarks(...args),
}));

vi.mock("@/lib/db/mutations/bookmarks", () => ({
  rebuildBookmarkTaxonomyState: (...args: Parameters<typeof rebuildBookmarkTaxonomyState>) =>
    mockRebuildBookmarkTaxonomyState(...args),
}));

vi.mock("@/lib/bookmarks/persistence.server", () => ({
  backfillDueBookmarkEmbeddings: (...args: Parameters<typeof backfillDueBookmarkEmbeddings>) =>
    mockBackfillDueBookmarkEmbeddings(...args),
  writeBookmarkMasterFiles: (...args: Parameters<typeof writeBookmarkMasterFiles>) =>
    mockWriteBookmarkMasterFiles(...args),
}));

vi.mock("@/lib/bookmarks/enrich-opengraph", () => ({
  processBookmarksInBatches: (...args: Parameters<typeof processBookmarksInBatches>) =>
    mockProcessBookmarksInBatches(...args),
}));

vi.mock("@/lib/bookmarks/slug-manager", () => ({
  saveSlugMapping: (...args: Parameters<typeof saveSlugMapping>) => mockSaveSlugMapping(...args),
  generateSlugMapping: (...args: Parameters<typeof generateSlugMapping>) =>
    mockGenerateSlugMapping(...args),
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
  };
}

function buildSlugMapping(bookmarks: readonly BookmarkSlugSource[]): BookmarkSlugMapping {
  const slugs = Object.fromEntries(
    bookmarks.map((bookmark) => [
      bookmark.id,
      {
        id: bookmark.id,
        slug: bookmark.slug ?? `bookmark-${bookmark.id}`,
        url: bookmark.url,
        title: bookmark.title,
      },
    ]),
  );
  const reverseMap = Object.fromEntries(
    bookmarks.map((bookmark) => [bookmark.slug ?? `bookmark-${bookmark.id}`, bookmark.id]),
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

function buildIndex(count: number, checksum: string): BookmarksIndex {
  return {
    count,
    checksum,
    totalPages: 0,
    pageSize: 24,
    lastModified: "2024-01-01T00:00:00.000Z",
    lastFetchedAt: 0,
    lastAttemptedAt: 0,
  };
}

describe("refresh change-detection behavior (unit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SELECTIVE_OG_REFRESH = "true";
    delete process.env.IS_DATA_UPDATER;

    mockBackfillDueBookmarkEmbeddings.mockResolvedValue(undefined);
    mockGetAllBookmarks.mockResolvedValue([]);
    mockRebuildBookmarkTaxonomyState.mockResolvedValue(undefined);
    mockWriteBookmarkMasterFiles.mockImplementation((bookmarks: UnifiedBookmark[]) =>
      Promise.resolve(bookmarks),
    );
    mockProcessBookmarksInBatches.mockImplementation((bookmarks: UnifiedBookmark[]) =>
      Promise.resolve(bookmarks),
    );
    mockSaveSlugMapping.mockResolvedValue(undefined);
    mockGenerateSlugMapping.mockImplementation((bookmarks) => buildSlugMapping(bookmarks));
  });

  afterEach(() => {
    delete process.env.IS_DATA_UPDATER;
    bookmarksModule.cleanupBookmarksDataAccess();
  });

  it("persists when no prior index-state exists", async () => {
    const dataset = [buildBookmark("a")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue(buildIndex(0, "count:0"));

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("returns the persisted slug reconciliation to refresh callers", async () => {
    const dataset = [buildBookmark("a")];
    const reconciled = [{ ...dataset[0], slug: "stable-bookmark-a" }];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(buildIndex(0, "count:0"));
    mockWriteBookmarkMasterFiles.mockResolvedValue(reconciled);

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    await expect(bookmarksModule.refreshAndPersistBookmarks()).resolves.toEqual(reconciled);
    expect(mockSaveSlugMapping).toHaveBeenCalledWith(reconciled, true);
  });

  it("persists when bookmark count changes", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b"), buildBookmark("c")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue(buildIndex(5, "old-checksum"));

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("persists when checksum changes with equal count", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue(buildIndex(2, "different-checksum"));

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });

  it("rebuilds index-state without full rewrite when dataset is unchanged", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(2, calculateBookmarksChecksum(dataset)),
    );

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockRebuildBookmarkTaxonomyState).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).toHaveBeenCalledWith(dataset, false);
    expect(mockWriteBookmarkMasterFiles).not.toHaveBeenCalled();
    expect(mockBackfillDueBookmarkEmbeddings).not.toHaveBeenCalled();
  });

  it("drains due embedding checkpoints when scheduler data is unchanged", async () => {
    const dataset = [buildBookmark("a"), buildBookmark("b")];
    process.env.IS_DATA_UPDATER = "true";
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(dataset.length, calculateBookmarksChecksum(dataset)),
    );

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).not.toHaveBeenCalled();
    expect(mockBackfillDueBookmarkEmbeddings).toHaveBeenCalledOnce();
    expect(mockBackfillDueBookmarkEmbeddings).toHaveBeenCalledWith(dataset);
  });

  it("defaults to persist when index-state count is stale", async () => {
    const dataset = [buildBookmark("a")];

    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(2, calculateBookmarksChecksum(dataset)),
    );

    bookmarksModule.setRefreshBookmarksCallback(() => Promise.resolve(dataset));
    bookmarksModule.initializeBookmarksDataAccess();

    const result = await bookmarksModule.refreshAndPersistBookmarks();

    expect(result).toEqual(dataset);
    expect(mockWriteBookmarkMasterFiles).toHaveBeenCalledTimes(1);
    expect(mockRebuildBookmarkTaxonomyState).not.toHaveBeenCalled();
  });
});
