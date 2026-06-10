import { beforeEach, describe, expect, it, vi } from "vitest";
import { calculateBookmarksChecksum } from "@/lib/bookmarks/utils";
import type { RawApiBookmark, UnifiedBookmark } from "@/types/schemas/bookmark";

const mockGetBookmarksIndexFromDatabase = vi.fn();
const mockGetAllBookmarks = vi.fn();

vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: (...args: unknown[]) => mockGetBookmarksIndexFromDatabase(...args),
  getAllBookmarks: (...args: unknown[]) => mockGetAllBookmarks(...args),
}));

import { validateChecksumAndGetCached } from "@/lib/bookmarks/refresh-helpers";

const CREATED_AT = "2026-01-01T00:00:00.000Z";
const MODIFIED_AT = "2026-02-01T00:00:00.000Z";

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

  it("returns the cached dataset when the raw checksum matches the persisted index checksum", async () => {
    const raw = [buildRaw("a"), buildRaw("b")];
    const cached = [buildCached("a"), buildCached("b")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      checksum: calculateBookmarksChecksum(cached),
      count: cached.length,
    });
    mockGetAllBookmarks.mockResolvedValue(cached);

    const result = await validateChecksumAndGetCached(raw, false);

    expect(result.cached).toEqual(cached);
  });

  it("returns null cache when a bookmark's modifiedAt changed upstream", async () => {
    const raw = [buildRaw("a"), buildRaw("b", "2026-03-01T00:00:00.000Z")];
    const cached = [buildCached("a"), buildCached("b")];
    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      checksum: calculateBookmarksChecksum(cached),
      count: cached.length,
    });
    mockGetAllBookmarks.mockResolvedValue(cached);

    const result = await validateChecksumAndGetCached(raw, false);

    expect(result.cached).toBeNull();
  });

  it("skips the cache entirely when force is requested", async () => {
    const result = await validateChecksumAndGetCached([buildRaw("a")], true);

    expect(result.cached).toBeNull();
    expect(mockGetBookmarksIndexFromDatabase).not.toHaveBeenCalled();
  });

  it("bypasses cache in updater mode while Karakeep proxy images need S3 upgrades", async () => {
    const previousUpdater = process.env.IS_DATA_UPDATER;
    process.env.IS_DATA_UPDATER = "true";
    const cached = [
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
    mockGetBookmarksIndexFromDatabase.mockResolvedValue({
      checksum: calculateBookmarksChecksum(cached),
      count: cached.length,
    });
    mockGetAllBookmarks.mockResolvedValue(cached);

    try {
      const result = await validateChecksumAndGetCached([buildRaw("a")], false);

      expect(result.cached).toBeNull();
      expect(mockGetAllBookmarks).toHaveBeenCalled();
    } finally {
      if (previousUpdater === undefined) {
        delete process.env.IS_DATA_UPDATER;
      } else {
        process.env.IS_DATA_UPDATER = previousUpdater;
      }
    }
  });
});
