/**
 * Ensures bookmark search still returns results when a persisted index artifact
 * is available but the live bookmarks fetch returns no data.
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

const mockGetSerializedSearchIndexArtifact = vi.fn();
vi.mock("@/lib/db/queries/search-index-artifacts", () => ({
  getSerializedSearchIndexArtifact: (...args: unknown[]) =>
    mockGetSerializedSearchIndexArtifact(...args),
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

import { searchBookmarks } from "@/lib/search";

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
    mockGetSerializedSearchIndexArtifact.mockResolvedValue(serializedIndex);
    mockGetBookmarks.mockResolvedValue([]);
    mockLoadSlugMapping.mockResolvedValue(null);
    mockGetSlugForBookmark.mockReturnValue(null);
    mockTryGetEmbeddedSlug.mockReturnValue(null);
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

    expect(mockGetSerializedSearchIndexArtifact).toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.url).toBe("/bookmarks/sdk-slug");
    expect(results[0]?.title).toBe("SDK for Claude Code");
  });

  it("matches natural-language bookmark queries with extra filler words", async () => {
    const results = await searchBookmarks("what bookmarks do you have about sdk for claude code?");

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.title).toBe("SDK for Claude Code");
  });
});
