import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BookmarkSlugMapping,
  BookmarkSlugSource,
  UnifiedBookmark,
} from "@/types/schemas/bookmark";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import type { getAllBookmarks, getBookmarksIndexFromDatabase } from "@/lib/db/queries/bookmarks";
import type { rebuildBookmarkTaxonomyState } from "@/lib/db/mutations/bookmarks";
import type {
  backfillDueBookmarkEmbeddings,
  writeBookmarkMasterFiles,
} from "@/lib/bookmarks/persistence.server";
import type { processBookmarksInBatches } from "@/lib/bookmarks/enrich-opengraph";
import type { generateSlugMapping, saveSlugMapping } from "@/lib/bookmarks/slug-manager";

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
  getAllBookmarks: () => mockGetAllBookmarks(),
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
        slug: bookmark.slug ?? "",
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
    vi.stubEnv("NODE_ENV", "test");
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
      totalPages: 1,
      pageSize: 24,
      lastModified: "2024-01-01T00:00:00.000Z",
      lastFetchedAt: 0,
      lastAttemptedAt: 0,
      checksum: calculateBookmarksChecksum(dataset),
    });

    setRefreshBookmarksCallback(() => Promise.resolve(dataset));
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
