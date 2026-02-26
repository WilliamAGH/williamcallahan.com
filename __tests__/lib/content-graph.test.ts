/**
 * Test suite for content graph pre-computation functionality
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { writeContentGraphArtifacts } from "@/lib/db/mutations/content-graph";
import type { Mock, MockedFunction } from "vitest";

// Mock DB mutations for content graph persistence
vi.mock("@/lib/db/mutations/content-graph");
vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/bookmarks-data-access.server");
vi.mock("@/lib/blog");
vi.mock("@/lib/utils/logger");
vi.mock("@/lib/search/index-builder");
vi.mock("@/lib/content-similarity/aggregator");
vi.mock("@/lib/content-similarity", () => ({
  findMostSimilar: vi.fn(),
  DEFAULT_WEIGHTS: { tagMatch: 0.4, textSimilarity: 0.3, domainMatch: 0.2, recency: 0.1 },
}));
vi.mock("@/data/projects", () => ({
  projects: [],
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
      // Mock normalized content structure
      const mockNormalizedContent = [
        {
          type: "bookmark" as const,
          id: "b1",
          title: "Test Bookmark",
          tags: ["javascript"],
          url: "https://example.com",
          content: "Test bookmark content",
          createdAt: "2024-01-01",
        },
        {
          type: "bookmark" as const,
          id: "b2",
          title: "Another Bookmark",
          tags: ["typescript"],
          url: "https://test.com",
          content: "Another bookmark content",
          createdAt: "2024-01-02",
        },
        {
          type: "blog" as const,
          id: "p1",
          title: "Test Post",
          tags: ["javascript"],
          url: "/blog/test-post",
          content: "Test blog content",
          createdAt: "2024-01-01",
        },
      ];

      const mockBlogPosts = [
        {
          id: "p1",
          title: "Test Post",
          tags: ["javascript"],
          slug: "test-post",
          content: "Test content",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
          status: "published",
        },
      ];

      // Setup mocks
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { getAllPosts } = await import("@/lib/blog");
      const { findMostSimilar } = await import("@/lib/content-similarity");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");

      (aggregateAllContent as Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as Mock).mockImplementation((_source, candidates) => {
        // Return mock similar content
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      (refreshBookmarks as Mock).mockResolvedValue([]);
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
      // Mock normalized content with overlapping tags
      const mockNormalizedContent = [
        {
          type: "bookmark" as const,
          id: "1",
          tags: ["javascript", "react"],
          title: "JS React Bookmark",
          url: "https://example1.com",
          content: "JS React content",
          createdAt: "2024-01-01",
        },
        {
          type: "bookmark" as const,
          id: "2",
          tags: ["javascript", "vue"],
          title: "JS Vue Bookmark",
          url: "https://example2.com",
          content: "JS Vue content",
          createdAt: "2024-01-02",
        },
        {
          type: "blog" as const,
          id: "3",
          tags: ["react", "typescript"],
          title: "React TS Post",
          url: "/blog/react-ts",
          content: "React TS content",
          createdAt: "2024-01-01",
        },
      ];

      const mockBlogPosts = [
        {
          id: "3",
          tags: ["react", "typescript"],
          title: "React TS Post",
          slug: "react-ts-post",
          content: "Test content",
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
          status: "published",
        },
      ];

      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { getAllPosts } = await import("@/lib/blog");
      const { findMostSimilar } = await import("@/lib/content-similarity");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");

      (aggregateAllContent as Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as Mock).mockImplementation((_source, candidates) => {
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      (refreshBookmarks as Mock).mockResolvedValue([]);
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

    it.todo("should save metadata with correct counts", async () => {
      const mockNormalizedContent = [
        ...Array(50)
          .fill(null)
          .map((_, i) => ({
            type: "bookmark" as const,
            id: `b${i}`,
            title: `Bookmark ${i}`,
            url: `https://example${i}.com`,
            tags: [],
            content: `Bookmark ${i} content`,
            createdAt: "2024-01-01",
          })),
        ...Array(10)
          .fill(null)
          .map((_, i) => ({
            type: "blog" as const,
            id: `p${i}`,
            title: `Post ${i}`,
            url: `/blog/post-${i}`,
            tags: [],
            content: `Post ${i} content`,
            createdAt: "2024-01-01",
          })),
      ];

      const mockBlogPosts = Array(10)
        .fill(null)
        .map((_, i) => ({
          id: `p${i}`,
          title: `Post ${i}`,
          slug: `post-${i}`,
          content: `Content ${i}`,
          tags: [],
          createdAt: "2024-01-01",
          updatedAt: "2024-01-01",
          status: "published",
        }));

      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { getAllPosts } = await import("@/lib/blog");
      const { findMostSimilar } = await import("@/lib/content-similarity");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");

      (aggregateAllContent as Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as Mock).mockImplementation((_source, candidates) => {
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      // Mock getBookmarks to return previous bookmarks (empty initially)
      (getBookmarks as Mock).mockResolvedValue([]);
      // Return mock bookmarks data to ensure the fetch succeeds
      (refreshBookmarks as Mock).mockResolvedValue(
        Array(50)
          .fill(null)
          .map((_, i) => ({
            id: `b${i}`,
            title: `Bookmark ${i}`,
            url: `https://example${i}.com`,
            tags: [],
            description: `Bookmark ${i} description`,
            dateBookmarked: "2024-01-01",
          })),
      );
      mockWriteContentGraphArtifacts.mockResolvedValue(undefined);

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify metadata was written via DB artifacts
      const artifactsArg = mockWriteContentGraphArtifacts.mock.calls[0]?.[0];
      const metadataArtifact = artifactsArg?.find(
        (a: { artifactType: string }) => a.artifactType === "metadata",
      );

      expect(metadataArtifact).toBeDefined();
      if (metadataArtifact) {
        expect(metadataArtifact.payload).toMatchObject({
          version: "1.0.0",
          generated: expect.any(String),
          counts: expect.objectContaining({
            bookmarks: 50,
            blogPosts: 10,
          }),
        });
      }
    });

    it("should handle errors gracefully", async () => {
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");

      // Mock aggregator to throw error for content graph failure
      (aggregateAllContent as Mock).mockRejectedValue(new Error("Content aggregation failed"));
      (getBookmarks as Mock).mockResolvedValue([]); // Mock getBookmarks to return empty array
      (refreshBookmarks as Mock).mockRejectedValue(new Error("API Error"));

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
