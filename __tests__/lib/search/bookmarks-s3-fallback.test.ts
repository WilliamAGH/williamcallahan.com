/**
 * Bookmark search via hybrid PostgreSQL (FTS + trigram + pgvector).
 *
 * These tests verify that searchBookmarks correctly delegates to
 * hybridSearchBookmarks and maps results to SearchResult format.
 */

// Mock query embedding (requires AI endpoint not available in tests)
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn<typeof buildQueryEmbedding>().mockResolvedValue(undefined),
}));

const mockHybridSearchBookmarks = vi.fn<typeof hybridSearchBookmarks>();
vi.mock("@/lib/db/queries/hybrid-search", () => ({
  hybridSearchBookmarks: (...args: Parameters<typeof hybridSearchBookmarks>) =>
    mockHybridSearchBookmarks(...args),
  hybridSearchThoughts: vi.fn<typeof hybridSearchThoughts>().mockResolvedValue([]),
}));

import { searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";
import type { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";
import type { hybridSearchBookmarks, hybridSearchThoughts } from "@/lib/db/queries/hybrid-search";

function buildBookmark(
  fields: Pick<UnifiedBookmark, "id" | "title" | "description" | "slug">,
): UnifiedBookmark {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return unifiedBookmarkSchema.parse({
    url: `https://example.com/${fields.slug}`,
    tags: [],
    dateBookmarked: timestamp,
    sourceUpdatedAt: timestamp,
    ...fields,
  });
}

describe("searchBookmarks - hybrid PostgreSQL search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array for empty query without hitting DB", async () => {
    const results = await searchBookmarks("");
    expect(results).toHaveLength(0);
    expect(mockHybridSearchBookmarks).not.toHaveBeenCalled();
  });

  it("returns mapped results from hybrid search", async () => {
    mockHybridSearchBookmarks.mockResolvedValueOnce([
      {
        bookmark: buildBookmark({
          id: "bk-1",
          title: "SDK for Claude Code",
          description: "CLI tool for AI development",
          slug: "sdk-for-claude-code",
        }),
        score: 0.92,
      },
    ]);

    const results = await searchBookmarks("sdk");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.title).toBe("SDK for Claude Code");
    expect(results[0]?.url).toBe(buildBookmarkPath("sdk-for-claude-code"));
    expect(results[0]?.type).toBe("bookmark");
    expect(results[0]?.score).toBe(0.92);
  });

  it("normalizes the query (lowercase, collapsed whitespace, punctuation kept) before hybrid search", async () => {
    mockHybridSearchBookmarks.mockResolvedValueOnce([]);

    await searchBookmarks("  Next.js   Tools ");
    expect(mockHybridSearchBookmarks).toHaveBeenCalledWith(
      expect.objectContaining({ query: "next.js tools" }),
    );
  });

  it("handles multiple results sorted by score", async () => {
    mockHybridSearchBookmarks.mockResolvedValueOnce([
      {
        bookmark: buildBookmark({ id: "bk-1", title: "First", description: "Desc", slug: "first" }),
        score: 0.95,
      },
      {
        bookmark: buildBookmark({
          id: "bk-2",
          title: "Second",
          description: "Desc",
          slug: "second",
        }),
        score: 0.8,
      },
    ]);

    const results = await searchBookmarks("test");
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[1]?.id).toBe("bk-2");
  });
});
