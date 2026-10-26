import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import type { BookmarksIndex, RawApiBookmark, UnifiedBookmark } from "@/types/schemas/bookmark";
import type { getAllBookmarks, getBookmarksIndexFromDatabase } from "@/lib/db/queries/bookmarks";

const mockGetBookmarksIndexFromDatabase = vi.fn<typeof getBookmarksIndexFromDatabase>();
const mockGetAllBookmarks = vi.fn<typeof getAllBookmarks>();

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: (...args: Parameters<typeof getBookmarksIndexFromDatabase>) =>
    mockGetBookmarksIndexFromDatabase(...args),
  getAllBookmarks: (...args: Parameters<typeof getAllBookmarks>) => mockGetAllBookmarks(...args),
}));

import { validateChecksumAndGetCached } from "@/lib/bookmarks/refresh-helpers";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const MODIFIED_AT = "2026-02-01T00:00:00.000Z";

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

function buildRaw(id: string, modifiedAt = MODIFIED_AT): RawApiBookmark {
  return {
    id,
    createdAt: CREATED_AT,
    modifiedAt,
    title: `Bookmark ${id}`,
    archived: false,
    favourited: false,
    taggingStatus: null,
    summarizationStatus: null,
    note: null,
    summary: null,
    tags: [],
    content: {
      type: "link",
      url: `https://example.com/${id}`,
      title: `Bookmark ${id}`,
      description: null,
    },
  };
}

function buildCached(id: string, overrides: Partial<UnifiedBookmark> = {}): UnifiedBookmark {
  return {
    id,
    slug: `example-com-${id}`,
    url: `https://example.com/${id}`,
    title: `Bookmark ${id}`,
    description: "",
    tags: [],
    dateBookmarked: CREATED_AT,
    modifiedAt: MODIFIED_AT,
    sourceUpdatedAt: MODIFIED_AT,
    ...overrides,
  };
}

describe("validateChecksumAndGetCached", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([false, true])(
    "reuses enriched source members with retained history: %s",
    async (retainHistory) => {
      const raw = [buildRaw("a"), buildRaw("b")];
      const selected = [
        buildCached("b", {
          summary: "Persisted summary",
          ogImage: "https://example.com/image.png",
        }),
        buildCached("a"),
      ];
      const cached = retainHistory ? [...selected, buildCached("c", { slug: "" })] : selected;
      mockGetBookmarksIndexFromDatabase.mockResolvedValue(
        buildIndex(raw.length, calculateBookmarksChecksum(selected)),
      );
      mockGetAllBookmarks.mockResolvedValue(cached);

      const result = await validateChecksumAndGetCached(raw, false);

      expect(result.cached).toEqual(selected);
      expect(result.cached?.[0]).toMatchObject({
        id: "b",
        summary: "Persisted summary",
        ogImage: "https://example.com/image.png",
      });
      expect(cached.map((bookmark) => bookmark.id)).toEqual(
        retainHistory ? ["b", "a", "c"] : ["b", "a"],
      );
    },
  );

  it.each([
    {
      reason: "a source ID is missing despite equal durable counts",
      ids: ["a", "c"],
      stale: false,
      indexCount: 2,
    },
    {
      reason: "cached modification differs from the matching index",
      ids: ["a", "b"],
      stale: true,
      indexCount: 2,
    },
    {
      reason: "the index count differs from the source",
      ids: ["a", "b"],
      stale: false,
      indexCount: 3,
    },
  ])("rejects cache when $reason", async ({ ids, stale, indexCount }) => {
    const raw = [buildRaw("a"), buildRaw("b")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(indexCount, calculateBookmarksChecksum([buildCached("a"), buildCached("b")])),
    );
    mockGetAllBookmarks.mockResolvedValue(
      ids.map((id) => buildCached(id, stale && id === "b" ? { modifiedAt: CREATED_AT } : {})),
    );

    const result = await validateChecksumAndGetCached(raw, false);

    expect(result.cached).toBeNull();
  });

  it("rejects duplicate source IDs despite matching index and durable counts", async () => {
    const raw = [buildRaw("a"), buildRaw("a")];
    const cached = [buildCached("a"), buildCached("b")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(raw.length, calculateBookmarksChecksum([buildCached("a"), buildCached("a")])),
    );
    mockGetAllBookmarks.mockResolvedValue(cached);

    const result = await validateChecksumAndGetCached(raw, false);

    expect(result.cached).toBeNull();
  });

  it("returns null cache when a bookmark's modifiedAt changed upstream", async () => {
    const raw = [buildRaw("a"), buildRaw("b", "2026-03-01T00:00:00.000Z")];
    const cached = [buildCached("a"), buildCached("b")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue(
      buildIndex(cached.length, calculateBookmarksChecksum(cached)),
    );
    mockGetAllBookmarks.mockResolvedValue(cached);

    const result = await validateChecksumAndGetCached(raw, false);

    expect(result.cached).toBeNull();
  });

  it("skips the cache entirely when force is requested", async () => {
    const result = await validateChecksumAndGetCached([buildRaw("a")], true);

    expect(result.cached).toBeNull();
    expect(mockGetBookmarksIndexFromDatabase).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "checks source images only (asset in source: %s)",
    async (assetInSource) => {
      const previousUpdater = process.env.IS_DATA_UPDATER;
      process.env.IS_DATA_UPDATER = "true";
      const withoutAsset = buildCached("b");
      const cached = [
        withoutAsset,
        buildCached("a", {
          content: {
            type: "link",
            url: "https://example.com/a",
            title: "Bookmark a",
            description: null,
            imageAssetId: "asset-1",
          },
          ogImage: "/api/assets/asset-1",
          ogImageExternal: "/api/assets/asset-1",
        }),
      ];
      const selected = assetInSource ? cached : [withoutAsset];
      const raw = assetInSource ? [buildRaw("a"), buildRaw("b")] : [buildRaw("b")];
      mockGetBookmarksIndexFromDatabase.mockResolvedValue(
        buildIndex(raw.length, calculateBookmarksChecksum(selected)),
      );
      mockGetAllBookmarks.mockResolvedValue(cached);

      try {
        const result = await validateChecksumAndGetCached(raw, false);

        expect(result.cached).toEqual(assetInSource ? null : selected);
        expect(mockGetAllBookmarks).toHaveBeenCalled();
      } finally {
        if (previousUpdater === undefined) {
          delete process.env.IS_DATA_UPDATER;
        } else {
          process.env.IS_DATA_UPDATER = previousUpdater;
        }
      }
    },
  );
});
