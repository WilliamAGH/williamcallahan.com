/**
 * Ensures bookmark search still returns results when the S3 index is available
 * but the live bookmarks fetch returns no data (e.g., API failure or cold start).
 */

import MiniSearch from "minisearch";
import type { BookmarkIndexItem, SerializedIndex } from "@/types/search";

process.env.USE_S3_SEARCH_INDEXES = "true";

const mockReadJsonS3 = jest.fn();
jest.mock("@/lib/s3-utils", () => ({
  readJsonS3: (...args: unknown[]) => mockReadJsonS3(...args),
}));

const mockGetBookmarks = jest.fn();
jest.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarks: (...args: unknown[]) => mockGetBookmarks(...args),
}));

const mockLoadSlugMapping = jest.fn();
const mockGetSlugForBookmark = jest.fn();
jest.mock("@/lib/bookmarks/slug-manager", () => ({
  loadSlugMapping: (...args: unknown[]) => mockLoadSlugMapping(...args),
  getSlugForBookmark: (...args: unknown[]) => mockGetSlugForBookmark(...args),
}));

const mockTryGetEmbeddedSlug = jest.fn();
jest.mock("@/lib/bookmarks/slug-helpers", () => ({
  tryGetEmbeddedSlug: (...args: unknown[]) => mockTryGetEmbeddedSlug(...args),
}));

jest.mock("@/lib/utils/env-logger", () => ({
  envLogger: {
    log: jest.fn(),
  },
}));

jest.mock("@/lib/health/memory-health-monitor", () => ({
  getMemoryHealthMonitor: () => ({
    shouldAcceptNewRequests: () => true,
    on: jest.fn(),
    off: jest.fn(),
  }),
}));

jest.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: jest.fn(),
    set: jest.fn(),
    getSearchResults: jest.fn(),
    setSearchResults: jest.fn(),
    shouldRefreshSearch: jest.fn(),
    clearAllCaches: jest.fn(),
  },
}));

import { searchBookmarks } from "@/lib/search";
import { ServerCacheInstance } from "@/lib/server-cache";

describe("searchBookmarks - S3 fallback mapping", () => {
  const bookmarks: Array<BookmarkIndexItem & { slug: string }> = [
    {
      id: "bk-1",
      title: "SDK for Claude Code",
      description: "CLI tool",
      tags: "cli\nsdk",
      url: "https://example.com/sdk",
      author: "",
      publisher: "",
      slug: "sdk-slug",
    },
  ];

  const serializedIndex: SerializedIndex = (() => {
    const index = new MiniSearch<BookmarkIndexItem>({
      fields: ["title", "description", "tags", "url", "slug"],
      storeFields: ["id", "title", "description", "url", "slug"],
      idField: "id",
      searchOptions: { prefix: true, fuzzy: 0.2 },
    });
    index.addAll(bookmarks);

    return {
      index: index.toJSON(),
      metadata: {
        itemCount: bookmarks.length,
        buildTime: new Date().toISOString(),
        version: "test",
      },
    };
  })();

  beforeEach(() => {
    jest.clearAllMocks();
    mockReadJsonS3.mockResolvedValue(serializedIndex);
    mockGetBookmarks.mockResolvedValue([]);
    mockLoadSlugMapping.mockResolvedValue(null);
    mockGetSlugForBookmark.mockReturnValue(null);
    mockTryGetEmbeddedSlug.mockReturnValue(null);
    (ServerCacheInstance.getSearchResults as jest.Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshSearch as jest.Mock).mockReturnValue(true);
  });

  it("returns results using stored fields when live fetch returns no bookmarks", async () => {
    const results = await searchBookmarks("sdk");

    expect(mockReadJsonS3).toHaveBeenCalled();
    const cacheArgs = (ServerCacheInstance.set as jest.Mock).mock.calls[0]?.[1];
    expect(cacheArgs?.bookmarks?.length ?? 0).toBeGreaterThan(0);
    expect(typeof cacheArgs?.index?.documentCount).toBe("number");
    expect(cacheArgs?.index?.documentCount ?? 0).toBeGreaterThan(0);
    const debugHits = (cacheArgs?.index as MiniSearch<BookmarkIndexItem> | undefined)?.search("sdk") ?? [];
    expect(debugHits.length).toBeGreaterThan(0);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.url).toBe("/bookmarks/sdk-slug");
    expect(results[0]?.title).toBe("SDK for Claude Code");
    expect(ServerCacheInstance.setSearchResults).toHaveBeenCalled();
  });
});
