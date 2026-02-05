/**
 * Ensures bookmark search still returns results when the S3 index is available
 * but the live bookmarks fetch returns no data (e.g., API failure or cold start).
 */

import MiniSearch from "minisearch";
import type { BookmarkIndexItem, SerializedIndex } from "@/types/schemas/search";

// Save original env value to restore after tests (prevent leaking to other test files)
const originalUseS3SearchIndexes = process.env.USE_S3_SEARCH_INDEXES;

// Mock search constants to control feature flags
vi.mock("@/lib/search/constants", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search/constants")>();
  return {
    ...actual,
    USE_S3_INDEXES: true,
  };
});

const mockReadJsonS3 = vi.fn();
vi.mock("@/lib/s3/json", () => ({
  readJsonS3Optional: (...args: unknown[]) => mockReadJsonS3(...args),
}));

const mockGetBookmarks = vi.fn();
vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarks: (...args: unknown[]) => mockGetBookmarks(...args),
}));

const mockLoadSlugMapping = vi.fn();
const mockGetSlugForBookmark = vi.fn();
vi.mock("@/lib/bookmarks/slug-manager", () => ({
  loadSlugMapping: (...args: unknown[]) => mockLoadSlugMapping(...args),
  getSlugForBookmark: (...args: unknown[]) => mockGetSlugForBookmark(...args),
}));

const mockTryGetEmbeddedSlug = vi.fn();
const mockGenerateFallbackSlug = vi.fn((url: string, id: string) => `fallback-${id}`);
vi.mock("@/lib/bookmarks/slug-helpers", () => ({
  tryGetEmbeddedSlug: (...args: unknown[]) => mockTryGetEmbeddedSlug(...args),
  generateFallbackSlug: (url: string, id: string) => mockGenerateFallbackSlug(url, id),
}));

vi.mock("@/lib/utils/env-logger", () => ({
  envLogger: {
    log: vi.fn(),
  },
}));

vi.mock("@/lib/health/memory-health-monitor", () => ({
  getMemoryHealthMonitor: () => ({
    shouldAcceptNewRequests: () => true,
    on: vi.fn(),
    off: vi.fn(),
  }),
}));

vi.mock("@/lib/server-cache", () => ({
  ServerCacheInstance: {
    get: vi.fn(),
    set: vi.fn(),
    getStats: vi.fn().mockReturnValue({
      keys: 0,
      hits: 0,
      misses: 0,
      ksize: 0,
      vsize: 0,
      sizeBytes: 0,
      maxSizeBytes: 0,
      utilizationPercent: 0,
    }),
    getSearchResults: vi.fn(),
    setSearchResults: vi.fn(),
    shouldRefreshSearch: vi.fn(),
    clearAllCaches: vi.fn(),
  },
}));

import { searchBookmarks } from "@/lib/search";
import { ServerCacheInstance } from "@/lib/server-cache";
import type { Mock } from "vitest";

describe("searchBookmarks - S3 fallback mapping", () => {
  const bookmarks: Array<BookmarkIndexItem & { slug: string }> = [
    {
      id: "bk-1",
      title: "SDK for Claude Code",
      description: "CLI tool",
      summary: "CLI tool summary",
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
    // Set env var for each test (Vitest reuses process across files)
    process.env.USE_S3_SEARCH_INDEXES = "true";
    vi.clearAllMocks();
    mockReadJsonS3.mockResolvedValue(serializedIndex);
    mockGetBookmarks.mockResolvedValue([]);
    mockLoadSlugMapping.mockResolvedValue(null);
    mockGetSlugForBookmark.mockReturnValue(null);
    mockTryGetEmbeddedSlug.mockReturnValue(null);
    (ServerCacheInstance.getSearchResults as Mock).mockReturnValue(undefined);
    (ServerCacheInstance.shouldRefreshSearch as Mock).mockReturnValue(true);
  });

  afterEach(() => {
    // Restore original env value to prevent leaking to other test files
    // Setting process.env.FOO = undefined coerces to the string "undefined" in Node.
    // Restore by deleting when it was originally unset.
    if (originalUseS3SearchIndexes === undefined) {
      delete process.env.USE_S3_SEARCH_INDEXES;
    } else {
      process.env.USE_S3_SEARCH_INDEXES = originalUseS3SearchIndexes;
    }
  });

  it("returns results using stored fields when live fetch returns no bookmarks", async () => {
    const results = await searchBookmarks("sdk");

    expect(mockReadJsonS3).toHaveBeenCalled();
    const cacheArgs = (ServerCacheInstance.set as Mock).mock.calls[0]?.[1];
    expect(cacheArgs?.bookmarks?.length ?? 0).toBeGreaterThan(0);
    expect(typeof cacheArgs?.index?.documentCount).toBe("number");
    expect(cacheArgs?.index?.documentCount ?? 0).toBeGreaterThan(0);
    const debugHits =
      (cacheArgs?.index as MiniSearch<BookmarkIndexItem> | undefined)?.search("sdk") ?? [];
    expect(debugHits.length).toBeGreaterThan(0);
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.url).toBe("/bookmarks/sdk-slug");
    expect(results[0]?.title).toBe("SDK for Claude Code");
    expect(ServerCacheInstance.setSearchResults).toHaveBeenCalled();
  });
});
