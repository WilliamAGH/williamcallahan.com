/**
 * Bookmark search via hybrid PostgreSQL (FTS + trigram + pgvector).
 *
 * These tests verify that searchBookmarks correctly delegates to
 * hybridSearchBookmarks and maps results to SearchResult format.
 */

// Mock query embedding (requires AI endpoint not available in tests)
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

const mockHybridSearchBookmarks = vi.fn();
vi.mock("@/lib/db/queries/hybrid-search", () => ({
  hybridSearchBookmarks: (...args: unknown[]) => mockHybridSearchBookmarks(...args),
  hybridSearchThoughts: vi.fn().mockResolvedValue([]),
}));

import { searchBookmarks } from "@/lib/search/searchers/dynamic-searchers";

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
        bookmark: {
          id: "bk-1",
          title: "SDK for Claude Code",
          description: "CLI tool for AI development",
          slug: "sdk-for-claude-code",
        },
        score: 0.92,
      },
    ]);

    const results = await searchBookmarks("sdk");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[0]?.title).toBe("SDK for Claude Code");
    expect(results[0]?.url).toBe("/bookmarks/sdk-for-claude-code");
    expect(results[0]?.type).toBe("bookmark");
    expect(results[0]?.score).toBe(0.92);
  });

  it("sanitizes query before passing to hybrid search", async () => {
    mockHybridSearchBookmarks.mockResolvedValueOnce([]);

    await searchBookmarks("test.*special[chars]");
    expect(mockHybridSearchBookmarks).toHaveBeenCalledWith(
      expect.objectContaining({ query: "test special chars" }),
    );
  });

  it("handles multiple results sorted by score", async () => {
    mockHybridSearchBookmarks.mockResolvedValueOnce([
      {
        bookmark: { id: "bk-1", title: "First", description: "Desc", slug: "first" },
        score: 0.95,
      },
      {
        bookmark: { id: "bk-2", title: "Second", description: "Desc", slug: "second" },
        score: 0.8,
      },
    ]);

    const results = await searchBookmarks("test");
    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("bk-1");
    expect(results[1]?.id).toBe("bk-2");
  });
});
