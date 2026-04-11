/**
 * Test suite for content graph pre-computation functionality.
 *
 * The content graph builder uses pgvector cosine similarity via
 * findSimilarByEntity rather than the old in-memory aggregator.
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { writeContentGraphArtifacts } from "@/lib/db/mutations/content-graph";
import type { MockedFunction } from "vitest";

// Mock DB mutations for content graph persistence
vi.mock("@/lib/db/mutations/content-graph");
vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/bookmarks-data-access.server");
vi.mock("@/lib/blog");
vi.mock("@/lib/utils/logger");
vi.mock("@/lib/search/index-builder");
vi.mock("@/lib/db/queries/bookmarks");
vi.mock("@/lib/db/mutations/search-index-artifacts");
vi.mock("@/lib/db/mutations/image-manifests");
vi.mock("@/lib/s3/objects", () => ({
  listS3Objects: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/data/projects", () => ({
  projects: [],
}));

// Mock cross-domain similarity (pgvector queries) — fallback path
const mockFindSimilarByEntity = vi.fn();
vi.mock("@/lib/db/queries/cross-domain-similarity", () => ({
  findSimilarByEntity: (...args: unknown[]) => mockFindSimilarByEntity(...args),
}));

// Mock embedding-based similarity — primary path
const mockFindSimilarByEmbedding = vi.fn();
const mockRankEmbeddingCandidates = vi.fn();
vi.mock("@/lib/db/queries/embedding-similarity", () => ({
  findSimilarByEmbedding: (...args: unknown[]) => mockFindSimilarByEmbedding(...args),
  rankEmbeddingCandidates: (...args: unknown[]) => mockRankEmbeddingCandidates(...args),
}));

// Mock DB connection for direct SQL queries in buildContentGraph
const mockDbExecute = vi.fn();
vi.mock("@/lib/db/connection", () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));

// Mock drizzle-orm sql tagged template
vi.mock("drizzle-orm", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, _tag: "sql" }),
    {
      raw: (s: string) => ({ raw: s, _tag: "sql-raw" }),
    },
  ),
}));

const mockWriteContentGraphArtifacts = writeContentGraphArtifacts as MockedFunction<
  typeof writeContentGraphArtifacts
>;

describe("Content Graph Pre-computation", () => {
  let manager: DataFetchManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new DataFetchManager();
  });

  describe("buildContentGraph", () => {
    it("should generate related content mappings for all items", async () => {
      // Mock embedding rows returned by the first db.execute call
      const embeddingRows = [
        { domain: "bookmark", entity_id: "b1", title: "Test Bookmark", content_date: "2024-01-01" },
        {
          domain: "bookmark",
          entity_id: "b2",
          title: "Another Bookmark",
          content_date: "2024-01-02",
        },
        { domain: "blog", entity_id: "p1", title: "Test Post", content_date: "2024-01-01" },
      ];

      // Mock tag content rows returned by the second db.execute call
      const tagContentRows = [
        { domain: "bookmark", entity_id: "b1", tags: ["javascript"] },
        { domain: "bookmark", entity_id: "b2", tags: ["typescript"] },
        { domain: "blog", entity_id: "p1", tags: ["javascript"] },
      ];

      // Bookmark quality rows (first db.execute call)
      const bookmarkQualityRows = [
        { id: "b1", has_description: true, is_favorite: false, has_word_count: true },
        { id: "b2", has_description: true, is_favorite: false, has_word_count: false },
      ];

      // First: bookmark quality; second: embedding rows; third: tag content rows
      mockDbExecute
        .mockResolvedValueOnce(bookmarkQualityRows)
        .mockResolvedValueOnce(embeddingRows)
        .mockResolvedValueOnce(tagContentRows);

      // Mock findSimilarByEntity to return similarity candidates (replaces findSimilarByEmbedding)
      mockFindSimilarByEntity.mockImplementation((options: { sourceId: string }) => {
        if (options.sourceId === "b1") {
          return Promise.resolve([
            {
              domain: "blog",
              entityId: "p1",
              title: "Test Post",
              similarity: 0.85,
              contentDate: "2024-01-01",
            },
            {
              domain: "bookmark",
              entityId: "b2",
              title: "Another Bookmark",
              similarity: 0.7,
              contentDate: "2024-01-02",
            },
          ]);
        }
        return Promise.resolve([
          {
            domain: "bookmark",
            entityId: "b1",
            title: "Test Bookmark",
            similarity: 0.8,
            contentDate: "2024-01-01",
          },
        ]);
      });

      // Mock rankEmbeddingCandidates to pass through candidates with scores
      mockRankEmbeddingCandidates.mockImplementation(
        ({ candidates }: { candidates: Array<{ similarity: number }> }) =>
          candidates.map((c) => ({ ...c, score: c.similarity })),
      );

      // Mock blog posts and projects for metadata
      const { getAllPostsMeta } = await import("@/lib/blog");
      (getAllPostsMeta as MockedFunction<typeof getAllPostsMeta>).mockResolvedValue([
        {
          id: "test-post",
          slug: "test-post",
          title: "Test Post",
          tags: ["javascript"],
          publishedAt: "2024-01-01",
        },
      ] as any);

      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const { getBookmarksIndexFromDatabase } = await import("@/lib/db/queries/bookmarks");

      (getBookmarks as any).mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
      (getBookmarksIndexFromDatabase as any).mockResolvedValue({
        count: 2,
        lastFetchedAt: Date.now(),
      });
      (refreshBookmarks as any).mockResolvedValue([{ id: "b1" }, { id: "b2" }]);
      mockWriteContentGraphArtifacts.mockResolvedValue(undefined);

      // Run the content graph build
      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify related content was written via DB artifacts
      expect(mockWriteContentGraphArtifacts).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ artifactType: "related-content" })]),
      );

      // Verify the structure of related content
      const artifactsArg = mockWriteContentGraphArtifacts.mock.calls[0]?.[0];
      const relatedArtifact = artifactsArg?.find(
        (a: { artifactType: string }) => a.artifactType === "related-content",
      );

      if (relatedArtifact) {
        const relatedContent = relatedArtifact.payload as Record<string, unknown[]>;

        // Should have entries for each content item
        expect(Object.keys(relatedContent)).toContain("bookmark:b1");
        expect(Object.keys(relatedContent)).toContain("bookmark:b2");
        expect(Object.keys(relatedContent)).toContain("blog:p1");

        // Each entry should have related items with required fields
        const b1Related = relatedContent["bookmark:b1"];
        if (b1Related && b1Related.length > 0) {
          expect(b1Related[0]).toHaveProperty("type");
          expect(b1Related[0]).toHaveProperty("id");
          expect(b1Related[0]).toHaveProperty("score");
          expect(b1Related[0]).toHaveProperty("title");
        }
      }
    });

    it("should build tag co-occurrence graph correctly", async () => {
      // Mock embedding rows
      const embeddingRows = [
        {
          domain: "bookmark",
          entity_id: "1",
          title: "JS React Bookmark",
          content_date: "2024-01-01",
        },
        {
          domain: "bookmark",
          entity_id: "2",
          title: "JS Vue Bookmark",
          content_date: "2024-01-02",
        },
        { domain: "blog", entity_id: "3", title: "React TS Post", content_date: "2024-01-01" },
      ];

      // Mock tag content rows with overlapping tags
      const tagContentRows = [
        { domain: "bookmark", entity_id: "1", tags: ["javascript", "react"] },
        { domain: "bookmark", entity_id: "2", tags: ["javascript", "vue"] },
        { domain: "blog", entity_id: "3", tags: ["react", "typescript"] },
      ];

      // Bookmark quality rows (first db.execute call)
      const bookmarkQualityRows = [
        { id: "1", has_description: true, is_favorite: false, has_word_count: false },
        { id: "2", has_description: true, is_favorite: false, has_word_count: false },
      ];

      mockDbExecute
        .mockResolvedValueOnce(bookmarkQualityRows)
        .mockResolvedValueOnce(embeddingRows)
        .mockResolvedValueOnce(tagContentRows);

      mockFindSimilarByEmbedding.mockResolvedValue([]);
      mockFindSimilarByEntity.mockImplementation(() => [
        {
          domain: "bookmark",
          entityId: "2",
          title: "JS Vue",
          similarity: 0.85,
          contentDate: "2024-01-02",
        },
      ]);
      mockRankEmbeddingCandidates.mockImplementation(
        ({
          candidates,
        }: {
          candidates: Array<{ domain: string; entityId: string; title: string }>;
        }) =>
          candidates.map((c, i) => ({
            domain: c.domain,
            entityId: c.entityId,
            title: c.title,
            score: 0.85 - i * 0.1,
          })),
      );

      const { getAllPostsMeta } = await import("@/lib/blog");
      (getAllPostsMeta as any).mockResolvedValue([]);

      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const { getBookmarksIndexFromDatabase } = await import("@/lib/db/queries/bookmarks");

      (getBookmarks as any).mockResolvedValue([{ id: "1" }, { id: "2" }]);
      (getBookmarksIndexFromDatabase as any).mockResolvedValue({
        count: 2,
        lastFetchedAt: Date.now(),
      });
      (refreshBookmarks as any).mockResolvedValue([{ id: "1" }, { id: "2" }]);
      mockWriteContentGraphArtifacts.mockResolvedValue(undefined);

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify tag graph was written via DB artifacts
      expect(mockWriteContentGraphArtifacts).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ artifactType: "tag-graph" })]),
      );

      // Check tag graph structure
      const artifactsArg = mockWriteContentGraphArtifacts.mock.calls[0]?.[0];
      const tagGraphArtifact = artifactsArg?.find(
        (a: { artifactType: string }) => a.artifactType === "tag-graph",
      );

      if (tagGraphArtifact) {
        const tagGraph = tagGraphArtifact.payload as {
          tags: Record<
            string,
            { count: number; coOccurrences: Record<string, number>; contentIds: string[] }
          >;
          tagHierarchy: Record<string, string[]>;
        };

        // Should have tag data
        expect(tagGraph.tags).toHaveProperty("javascript");
        expect(tagGraph.tags).toHaveProperty("react");

        // Check co-occurrence tracking
        const jsTag = tagGraph.tags.javascript;
        if (jsTag) {
          expect(jsTag.count).toBeGreaterThan(0);
          expect(jsTag.coOccurrences).toBeDefined();
          expect(jsTag.contentIds).toContain("bookmark:1");
          expect(jsTag.contentIds).toContain("bookmark:2");
        }
      }
    });

    it.todo("should save metadata with correct counts");

    it("should handle errors gracefully", async () => {
      // Make DB query fail
      mockDbExecute.mockRejectedValue(new Error("Failed query"));

      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const { getBookmarksIndexFromDatabase } = await import("@/lib/db/queries/bookmarks");

      (getBookmarks as any).mockResolvedValue([]);
      (getBookmarksIndexFromDatabase as any).mockResolvedValue({
        count: 0,
        lastFetchedAt: Date.now(),
      });
      (refreshBookmarks as any).mockRejectedValue(new Error("API Error"));

      const result = await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Should return error result for bookmarks
      const bookmarkResult = result.find((r) => r.operation === "bookmarks");
      expect(bookmarkResult?.success).toBe(false);
      expect(bookmarkResult?.error).toContain("API Error");

      // Content graph should also fail gracefully
      const graphResult = result.find((r) => r.operation === "content-graph");
      expect(graphResult?.success).toBe(false);
    });
  });
});
