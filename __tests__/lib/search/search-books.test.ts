/**
 * Books Search Tests
 *
 * Tests the books search function which uses hybrid PostgreSQL search
 * (FTS + trigram + pgvector) via hybridSearchBooks.
 */

// Mock query embedding (requires AI endpoint not available in tests)
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

const mockHybridSearchBooks = vi.fn();
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBooks: (...args: unknown[]) => mockHybridSearchBooks(...args),
  hybridSearchBlogPosts: vi.fn().mockResolvedValue([]),
}));

import { searchBooks } from "@/lib/search/searchers/dynamic-searchers";

describe("Books Search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Search Functionality", () => {
    it("should return empty array for empty query", async () => {
      const results = await searchBooks("");
      expect(results).toHaveLength(0);
      expect(mockHybridSearchBooks).not.toHaveBeenCalled();
    });

    it("should find books by title via hybrid search", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([
        {
          id: "cd8f9b4a-0555-405b-a95f-8fb8ab3110ea",
          title: "TypeScript Quickly",
          slug: "typescript-quickly-cd8f9b4a",
          authors: ["Yakov Fain", "Anton Moiseev"],
          description: "Learn TypeScript the fast way",
          coverUrl: "https://example.com/cover1.jpg",
          score: 0.85,
        },
      ]);

      const results = await searchBooks("TypeScript");
      expect(results.length).toBe(1);
      expect(results[0]?.title).toBe("TypeScript Quickly");
    });

    it("should pass sanitized query to hybrid search", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([]);

      await searchBooks("test.*query[abc]");
      expect(mockHybridSearchBooks).toHaveBeenCalledWith(
        expect.objectContaining({ query: "test query abc" }),
      );
    });
  });

  describe("Result Format", () => {
    it("should return SearchResult objects with correct shape", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([
        {
          id: "cd8f9b4a-0555-405b-a95f-8fb8ab3110ea",
          title: "TypeScript Quickly",
          slug: "typescript-quickly",
          authors: ["Yakov Fain"],
          description: null,
          coverUrl: null,
          score: 0.9,
        },
      ]);

      const results = await searchBooks("typescript");
      expect(results.length).toBe(1);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("type");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("url");
      expect(results[0]).toHaveProperty("score");
    });

    it("should have type 'page' for book results", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([
        {
          id: "1",
          title: "Test Book",
          slug: "test-book",
          authors: ["Author"],
          description: null,
          coverUrl: null,
          score: 0.8,
        },
      ]);

      const results = await searchBooks("test");
      expect(results[0]?.type).toBe("page");
    });

    it("should have URL pointing to /books/ path", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([
        {
          id: "1",
          title: "React Quickly",
          slug: "react-quickly",
          authors: [],
          description: null,
          coverUrl: null,
          score: 0.7,
        },
      ]);

      const results = await searchBooks("react");
      expect(results[0]?.url).toBe("/books/react-quickly");
    });

    it("should join authors as description", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([
        {
          id: "1",
          title: "Test",
          slug: "test",
          authors: ["Author A", "Author B"],
          description: null,
          coverUrl: null,
          score: 0.6,
        },
      ]);

      const results = await searchBooks("test");
      expect(results[0]?.description).toBe("Author A, Author B");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty results from DB", async () => {
      mockHybridSearchBooks.mockResolvedValueOnce([]);

      const results = await searchBooks("nonexistent");
      expect(results).toHaveLength(0);
    });

    it("should not throw on concurrent searches", async () => {
      mockHybridSearchBooks.mockResolvedValue([]);

      const searches = Promise.all([
        searchBooks("typescript"),
        searchBooks("java"),
        searchBooks("react"),
      ]);

      await expect(searches).resolves.toBeDefined();
    });
  });
});
