/**
 * @file Unit tests for Thoughts Chroma query operations
 * Tests semantic search, related content discovery, and suggestion features.
 * Focuses on functional regression testing - ensuring operations accept correct inputs
 * and produce expected output structures.
 * @module __tests__/lib/thoughts/chroma-queries.test
 */

// Mock chromadb before importing the query module
const mockCollection = {
  get: jest.fn(),
  query: jest.fn(),
};

jest.mock("chromadb", () => ({
  CloudClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue(mockCollection),
  })),
}));

describe("Thoughts Chroma Queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Default mock responses
    mockCollection.get.mockResolvedValue({
      ids: [],
      embeddings: [],
      metadatas: [],
      documents: [],
    });
    mockCollection.query.mockResolvedValue({
      ids: [[]],
      embeddings: [[]],
      metadatas: [[]],
      documents: [[]],
      distances: [[]],
    });
  });

  describe("getRelatedThoughts", () => {
    it("should return empty array when source thought has no embedding", async () => {
      const { getRelatedThoughts } = await import("@/lib/thoughts/chroma-queries");
      mockCollection.get.mockResolvedValue({
        ids: [],
        embeddings: [],
        metadatas: [],
        documents: [],
      });

      const related = await getRelatedThoughts("non-existent-id");

      expect(related).toEqual([]);
    });

    it("should return related thoughts excluding the source thought", async () => {
      const { getRelatedThoughts } = await import("@/lib/thoughts/chroma-queries");
      const sourceId = "source-thought-id";

      // Mock source thought embedding lookup
      mockCollection.get.mockResolvedValue({
        ids: [sourceId],
        embeddings: [[0.1, 0.2, 0.3]],
        metadatas: [{ slug: "source" }],
        documents: ["source content"],
      });

      // Mock query results including the source
      mockCollection.query.mockResolvedValue({
        ids: [[sourceId, "related-1", "related-2"]],
        metadatas: [
          [
            { slug: "source", title: "Source" },
            { slug: "related-1-slug", title: "Related 1" },
            { slug: "related-2-slug", title: "Related 2" },
          ],
        ],
        distances: [[0.0, 0.15, 0.25]],
        embeddings: [[]],
        documents: [[]],
      });

      const related = await getRelatedThoughts(sourceId, { limit: 5 });

      // Should exclude source thought
      expect(related).toHaveLength(2);
      expect(related.map(r => r.id)).not.toContain(sourceId);
      expect(related[0]).toEqual({
        id: "related-1",
        slug: "related-1-slug",
        title: "Related 1",
        distance: 0.15,
      });
    });

    it("should respect maxDistance option", async () => {
      const { getRelatedThoughts } = await import("@/lib/thoughts/chroma-queries");
      const sourceId = "source-id";

      mockCollection.get.mockResolvedValue({
        ids: [sourceId],
        embeddings: [[0.1, 0.2]],
        metadatas: [],
        documents: [],
      });

      mockCollection.query.mockResolvedValue({
        ids: [["close-1", "far-1", "close-2"]],
        metadatas: [
          [
            { slug: "close-1", title: "Close 1" },
            { slug: "far-1", title: "Far 1" },
            { slug: "close-2", title: "Close 2" },
          ],
        ],
        distances: [[0.1, 0.6, 0.2]],
        embeddings: [[]],
        documents: [[]],
      });

      const related = await getRelatedThoughts(sourceId, { maxDistance: 0.3 });

      expect(related).toHaveLength(2);
      expect(related.map(r => r.slug)).toEqual(["close-1", "close-2"]);
    });

    it("should respect limit option", async () => {
      const { getRelatedThoughts } = await import("@/lib/thoughts/chroma-queries");
      const sourceId = "source-id";

      mockCollection.get.mockResolvedValue({
        ids: [sourceId],
        embeddings: [[0.1]],
        metadatas: [],
        documents: [],
      });

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2", "t3", "t4", "t5"]],
        metadatas: [
          [
            { slug: "s1", title: "T1" },
            { slug: "s2", title: "T2" },
            { slug: "s3", title: "T3" },
            { slug: "s4", title: "T4" },
            { slug: "s5", title: "T5" },
          ],
        ],
        distances: [[0.1, 0.2, 0.3, 0.4, 0.5]],
        embeddings: [[]],
        documents: [[]],
      });

      const related = await getRelatedThoughts(sourceId, { limit: 2 });

      expect(related).toHaveLength(2);
    });
  });

  describe("searchThoughts", () => {
    it("should return empty array for no results", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      const results = await searchThoughts("some query");

      expect(results).toEqual([]);
    });

    it("should return search results with correct structure", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["result-1", "result-2"]],
        metadatas: [
          [
            { slug: "result-1-slug", title: "Result 1" },
            { slug: "result-2-slug", title: "Result 2" },
          ],
        ],
        distances: [[0.2, 0.4]],
        embeddings: [[]],
        documents: [[]],
      });

      const results = await searchThoughts("test query");

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: "result-1",
        slug: "result-1-slug",
        title: "Result 1",
        distance: 0.2,
      });
    });

    it("should filter by category when specified", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      await searchThoughts("test", { category: "javascript" });

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            $and: expect.arrayContaining([{ category: "javascript" }]),
          }),
        }),
      );
    });

    it("should exclude drafts by default", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      await searchThoughts("test");

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { draft: false },
        }),
      );
    });

    it("should include drafts when includeDrafts is true", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      await searchThoughts("test", { includeDrafts: true });

      // When includeDrafts is true and no category, where should be undefined
      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTexts: ["test"],
        }),
      );

      // Explicitly verify that 'where' filter is NOT applied when includeDrafts is true
      const callArgs = mockCollection.query.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(callArgs?.where).toBeUndefined();
    });

    it("should respect maxDistance option", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["close", "far"]],
        metadatas: [
          [
            { slug: "close", title: "Close" },
            { slug: "far", title: "Far" },
          ],
        ],
        distances: [[0.2, 0.8]],
        embeddings: [[]],
        documents: [[]],
      });

      const results = await searchThoughts("test", { maxDistance: 0.5 });

      expect(results).toHaveLength(1);
      expect(results[0]?.slug).toBe("close");
    });
  });

  describe("suggestCategory", () => {
    it("should return null when no clear suggestion", async () => {
      const { suggestCategory } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2", "t3", "t4", "t5"]],
        metadatas: [[{ category: "a" }, { category: "b" }, { category: "c" }, { category: "d" }, { category: "e" }]],
        distances: [[0.1, 0.2, 0.3, 0.4, 0.5]],
        embeddings: [[]],
        documents: [[]],
      });

      const suggestion = await suggestCategory("test content", "Test Title");

      expect(suggestion).toBeNull();
    });

    it("should return category when it appears in 40%+ of results", async () => {
      const { suggestCategory } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"]],
        metadatas: [
          [
            { category: "javascript" },
            { category: "javascript" },
            { category: "javascript" },
            { category: "javascript" },
            { category: "typescript" },
            { category: "typescript" },
            { category: "python" },
            { category: "rust" },
            { category: "go" },
            { category: "java" },
          ],
        ],
        distances: [[0.1, 0.1, 0.1, 0.1, 0.2, 0.2, 0.3, 0.4, 0.5, 0.6]],
        embeddings: [[]],
        documents: [[]],
      });

      const suggestion = await suggestCategory("test content", "Test Title");

      expect(suggestion).toBe("javascript");
    });

    it("should query with title and content combined", async () => {
      const { suggestCategory } = await import("@/lib/thoughts/chroma-queries");

      await suggestCategory("My content here", "My Title");

      expect(mockCollection.query).toHaveBeenCalledWith(
        expect.objectContaining({
          queryTexts: ["My Title\n\nMy content here"],
        }),
      );
    });
  });

  describe("suggestTags", () => {
    it("should return empty array when no tags found", async () => {
      const { suggestTags } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2"]],
        metadatas: [[{ tags: "" }, { tags: "" }]],
        distances: [[0.1, 0.2]],
        embeddings: [[]],
        documents: [[]],
      });

      const tags = await suggestTags("content", "title");

      expect(tags).toEqual([]);
    });

    it("should return tags weighted by distance", async () => {
      const { suggestTags } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2", "t3"]],
        metadatas: [
          [
            { tags: "javascript,testing" }, // Close match
            { tags: "javascript,react" }, // Medium match
            { tags: "python,testing" }, // Far match
          ],
        ],
        distances: [[0.1, 0.5, 1.0]], // Close, medium, far
        embeddings: [[]],
        documents: [[]],
      });

      const tags = await suggestTags("content", "title", 3);

      // javascript appears in close and medium matches
      // testing appears in close and far matches
      // react appears only in medium match
      // python appears only in far match
      expect(tags).toHaveLength(3);
      expect(tags).toContain("javascript");
      expect(tags).toContain("testing");
    });

    it("should respect maxTags limit", async () => {
      const { suggestTags } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1"]],
        metadatas: [[{ tags: "a,b,c,d,e,f,g,h" }]],
        distances: [[0.1]],
        embeddings: [[]],
        documents: [[]],
      });

      const tags = await suggestTags("content", "title", 3);

      expect(tags).toHaveLength(3);
    });

    it("should parse comma-separated tags correctly", async () => {
      const { suggestTags } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1"]],
        metadatas: [[{ tags: "react, vue , angular" }]], // With spaces
        distances: [[0.1]],
        embeddings: [[]],
        documents: [[]],
      });

      const tags = await suggestTags("content", "title");

      // Should trim whitespace
      expect(tags).toContain("react");
      expect(tags).toContain("vue");
      expect(tags).toContain("angular");
    });
  });

  describe("findPotentialDuplicates", () => {
    it("should return empty array when no close matches", async () => {
      const { findPotentialDuplicates } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2"]],
        metadatas: [
          [
            { slug: "s1", title: "T1" },
            { slug: "s2", title: "T2" },
          ],
        ],
        distances: [[0.5, 0.8]],
        embeddings: [[]],
        documents: [[]],
      });

      const duplicates = await findPotentialDuplicates("content", "title");

      expect(duplicates).toEqual([]);
    });

    it("should return matches below default threshold (0.15)", async () => {
      const { findPotentialDuplicates } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["dup1", "dup2", "not-dup"]],
        metadatas: [
          [
            { slug: "dup1-slug", title: "Duplicate 1" },
            { slug: "dup2-slug", title: "Duplicate 2" },
            { slug: "not-dup-slug", title: "Not Duplicate" },
          ],
        ],
        distances: [[0.05, 0.12, 0.5]],
        embeddings: [[]],
        documents: [[]],
      });

      const duplicates = await findPotentialDuplicates("content", "title");

      expect(duplicates).toHaveLength(2);
      expect(duplicates.map(d => d.slug)).toEqual(["dup1-slug", "dup2-slug"]);
    });

    it("should respect custom threshold", async () => {
      const { findPotentialDuplicates } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["t1", "t2"]],
        metadatas: [
          [
            { slug: "s1", title: "T1" },
            { slug: "s2", title: "T2" },
          ],
        ],
        distances: [[0.08, 0.12]],
        embeddings: [[]],
        documents: [[]],
      });

      const duplicates = await findPotentialDuplicates("content", "title", 0.1);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.slug).toBe("s1");
    });
  });

  describe("getCategoryDistribution", () => {
    it("should return empty map when no thoughts exist", async () => {
      const { getCategoryDistribution } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.get.mockResolvedValue({
        ids: [],
        metadatas: [],
        embeddings: [],
        documents: [],
      });

      const distribution = await getCategoryDistribution();

      expect(distribution.size).toBe(0);
    });

    it("should count categories correctly", async () => {
      const { getCategoryDistribution } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.get.mockResolvedValue({
        ids: ["t1", "t2", "t3", "t4"],
        metadatas: [
          { category: "javascript" },
          { category: "javascript" },
          { category: "typescript" },
          { category: "" }, // Uncategorized
        ],
        embeddings: [],
        documents: [],
      });

      const distribution = await getCategoryDistribution();

      expect(distribution.get("javascript")).toBe(2);
      expect(distribution.get("typescript")).toBe(1);
      expect(distribution.get("(uncategorized)")).toBe(1);
    });

    it("should handle batched retrieval", async () => {
      const { getCategoryDistribution } = await import("@/lib/thoughts/chroma-queries");

      // First batch returns 100 items
      const firstBatch = Array.from({ length: 100 }, () => ({ category: "test" }));
      // Second batch returns fewer items (end of data)
      const secondBatch = [{ category: "test" }, { category: "other" }];

      mockCollection.get
        .mockResolvedValueOnce({
          ids: Array.from({ length: 100 }, (_, i) => `t${i}`),
          metadatas: firstBatch,
          embeddings: [],
          documents: [],
        })
        .mockResolvedValueOnce({
          ids: ["t100", "t101"],
          metadatas: secondBatch,
          embeddings: [],
          documents: [],
        });

      const distribution = await getCategoryDistribution();

      expect(distribution.get("test")).toBe(101);
      expect(distribution.get("other")).toBe(1);
    });
  });

  describe("getTagDistribution", () => {
    it("should return empty array when no tags exist", async () => {
      const { getTagDistribution } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.get.mockResolvedValue({
        ids: ["t1"],
        metadatas: [{ tags: "" }],
        embeddings: [],
        documents: [],
      });

      const distribution = await getTagDistribution();

      expect(distribution).toEqual([]);
    });

    it("should return tags sorted by frequency", async () => {
      const { getTagDistribution } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.get.mockResolvedValue({
        ids: ["t1", "t2", "t3"],
        metadatas: [{ tags: "javascript,testing" }, { tags: "javascript,react" }, { tags: "testing" }],
        embeddings: [],
        documents: [],
      });

      const distribution = await getTagDistribution();

      // javascript: 2, testing: 2, react: 1
      expect(distribution[0]?.[0]).toBe("javascript");
      expect(distribution[0]?.[1]).toBe(2);
    });

    it("should respect limit parameter", async () => {
      const { getTagDistribution } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.get.mockResolvedValue({
        ids: ["t1"],
        metadatas: [{ tags: "a,b,c,d,e" }],
        embeddings: [],
        documents: [],
      });

      const distribution = await getTagDistribution(2);

      expect(distribution).toHaveLength(2);
    });
  });

  describe("Output Structure Consistency", () => {
    it("RelatedThought should have id, slug, title, distance", async () => {
      const { searchThoughts } = await import("@/lib/thoughts/chroma-queries");

      mockCollection.query.mockResolvedValue({
        ids: [["test-id"]],
        metadatas: [[{ slug: "test-slug", title: "Test Title" }]],
        distances: [[0.25]],
        embeddings: [[]],
        documents: [[]],
      });

      const results = await searchThoughts("test");

      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("slug");
      expect(results[0]).toHaveProperty("title");
      expect(results[0]).toHaveProperty("distance");
      expect(typeof results[0]?.id).toBe("string");
      expect(typeof results[0]?.slug).toBe("string");
      expect(typeof results[0]?.title).toBe("string");
      expect(typeof results[0]?.distance).toBe("number");
    });
  });
});
