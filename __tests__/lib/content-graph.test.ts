/**
 * Test suite for content graph pre-computation functionality
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS } from "@/lib/constants";
import type { NormalizedContent } from "@/types/related-content";

// Mock S3 utilities
jest.mock("@/lib/s3-utils");
jest.mock("@/lib/bookmarks/service.server");
jest.mock("@/lib/blog");
jest.mock("@/lib/utils/logger");
jest.mock("@/lib/search/index-builder");
jest.mock("@/lib/content-similarity/aggregator");
jest.mock("@/lib/content-similarity", () => ({
  findMostSimilar: jest.fn(),
  DEFAULT_WEIGHTS: { tag: 0.3, title: 0.3, content: 0.4 },
}));
jest.mock("@/data/projects", () => ({
  projects: [],
}));

const mockReadJsonS3 = readJsonS3 as jest.MockedFunction<typeof readJsonS3>;
const mockWriteJsonS3 = writeJsonS3 as jest.MockedFunction<typeof writeJsonS3>;

describe("Content Graph Pre-computation", () => {
  let manager: DataFetchManager;

  beforeEach(() => {
    jest.clearAllMocks();
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
          status: "published"
        },
      ];

      // Setup mocks
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { getAllPosts } = await import("@/lib/blog");
      const { findMostSimilar, DEFAULT_WEIGHTS } = await import("@/lib/content-similarity");
      const { projects } = await import("@/data/projects");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      
      (aggregateAllContent as jest.Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as jest.Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as jest.Mock).mockImplementation((source, candidates) => {
        // Return mock similar content
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      (refreshBookmarks as jest.Mock).mockResolvedValue([]);
      mockWriteJsonS3.mockResolvedValue({
        success: true,
        key: "test",
        etag: "test-etag",
      });

      // Run the content graph build
      const result = await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify related content was written
      expect(mockWriteJsonS3).toHaveBeenCalledWith(
        CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT,
        expect.any(Object)
      );

      // Verify the structure of related content
      const relatedContentCall = mockWriteJsonS3.mock.calls.find(
        call => call[0] === CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT
      );
      
      if (relatedContentCall) {
        const relatedContent = relatedContentCall[1] as Record<string, any[]>;
        
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
          status: "published"
        },
      ];

      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { getAllPosts } = await import("@/lib/blog");
      const { findMostSimilar, DEFAULT_WEIGHTS } = await import("@/lib/content-similarity");
      const { projects } = await import("@/data/projects");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      
      (aggregateAllContent as jest.Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as jest.Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as jest.Mock).mockImplementation((source, candidates) => {
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      (refreshBookmarks as jest.Mock).mockResolvedValue([]);
      mockWriteJsonS3.mockResolvedValue({
        success: true,
        key: "test",
        etag: "test-etag",
      });

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify tag graph was written
      expect(mockWriteJsonS3).toHaveBeenCalledWith(
        CONTENT_GRAPH_S3_PATHS.TAG_GRAPH,
        expect.any(Object)
      );

      // Check tag graph structure
      const tagGraphCall = mockWriteJsonS3.mock.calls.find(
        call => call[0] === CONTENT_GRAPH_S3_PATHS.TAG_GRAPH
      );
      
      if (tagGraphCall) {
        const tagGraph = tagGraphCall[1] as { tags: Record<string, any>; tagHierarchy: Record<string, string[]> };
        
        // Should have tag data
        expect(tagGraph.tags).toHaveProperty("javascript");
        expect(tagGraph.tags).toHaveProperty("react");
        
        // Check co-occurrence tracking
        const jsTag = tagGraph.tags["javascript"];
        if (jsTag) {
          expect(jsTag.count).toBeGreaterThan(0);
          expect(jsTag.coOccurrences).toBeDefined();
          expect(jsTag.contentIds).toContain("bookmark:1");
          expect(jsTag.contentIds).toContain("bookmark:2");
        }
      }
    });

    it("should save metadata with correct counts", async () => {
      const mockNormalizedContent = [
        ...Array(50).fill(null).map((_, i) => ({
          type: "bookmark" as const,
          id: `b${i}`,
          title: `Bookmark ${i}`,
          url: `https://example${i}.com`,
          tags: [],
          content: `Bookmark ${i} content`,
          createdAt: "2024-01-01",
        })),
        ...Array(10).fill(null).map((_, i) => ({
          type: "blog" as const,
          id: `p${i}`,
          title: `Post ${i}`,
          url: `/blog/post-${i}`,
          tags: [],
          content: `Post ${i} content`,
          createdAt: "2024-01-01",
        })),
      ];
      
      const mockBlogPosts = Array(10).fill(null).map((_, i) => ({
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
      const { findMostSimilar, DEFAULT_WEIGHTS } = await import("@/lib/content-similarity");
      const { projects } = await import("@/data/projects");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      
      (aggregateAllContent as jest.Mock).mockResolvedValue(mockNormalizedContent);
      (getAllPosts as jest.Mock).mockResolvedValue(mockBlogPosts);
      // Projects already mocked at module level
      (findMostSimilar as jest.Mock).mockImplementation((source, candidates) => {
        return candidates.slice(0, 2).map((c: any, i: number) => ({
          ...c,
          score: 0.9 - i * 0.1,
        }));
      });
      // DEFAULT_WEIGHTS already mocked at module level
      (refreshBookmarks as jest.Mock).mockResolvedValue([]);
      mockWriteJsonS3.mockResolvedValue({
        success: true,
        key: "test",
        etag: "test-etag",
      });

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify metadata was written
      expect(mockWriteJsonS3).toHaveBeenCalledWith(
        CONTENT_GRAPH_S3_PATHS.METADATA,
        expect.objectContaining({
          version: "1.0.0",
          generated: expect.any(String),
          counts: expect.objectContaining({
            bookmarks: 50,
            blogPosts: 10,
          }),
        })
      );
    });

    it("should handle errors gracefully", async () => {
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      
      // Mock aggregator to throw error for content graph failure
      (aggregateAllContent as jest.Mock).mockRejectedValue(new Error("Content aggregation failed"));
      (refreshBookmarks as jest.Mock).mockRejectedValue(new Error("API Error"));

      const result = await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Should return error result for bookmarks
      const bookmarkResult = result.find(r => r.operation === "bookmarks");
      expect(bookmarkResult?.success).toBe(false);
      expect(bookmarkResult?.error).toContain("API Error");
      
      // Content graph should also fail gracefully
      const graphResult = result.find(r => r.operation === "content-graph");
      expect(graphResult?.success).toBe(false);
    });
  });

  describe("Environment-aware paths", () => {
    it("should use environment-specific paths for all files", () => {
      const env = process.env.NODE_ENV;
      const expectedSuffix = env === "production" || !env ? "" : env === "test" ? "-test" : "-dev";
      
      expect(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT).toContain(`content-graph${expectedSuffix}`);
      expect(CONTENT_GRAPH_S3_PATHS.TAG_GRAPH).toContain(`content-graph${expectedSuffix}`);
      expect(CONTENT_GRAPH_S3_PATHS.METADATA).toContain(`content-graph${expectedSuffix}`);
    });
  });
});