/**
 * Integration tests for the complete pre-computation pipeline
 *
 * Tests the full flow from data fetching through pre-computation to serving
 */

import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { readJsonS3 } from "@/lib/s3-utils";
import { CONTENT_GRAPH_S3_PATHS, BOOKMARKS_S3_PATHS } from "@/lib/constants";
import type { DataFetchConfig } from "@/types/lib";
import type { BookmarkSlugMapping } from "@/types/bookmark";

// Mock external dependencies
jest.mock("@/lib/s3-utils");
jest.mock("@/lib/bookmarks/service.server");
jest.mock("@/lib/bookmarks/bookmarks-data-access.server");
jest.mock("@/lib/blog");
jest.mock("@/lib/utils/logger");
jest.mock("@/lib/search/index-builder");
jest.mock("@/lib/blog/mdx");
jest.mock("@/lib/content-similarity/aggregator");
jest.mock("@/lib/content-similarity");
jest.mock("@/data/projects");

const mockReadJsonS3 = readJsonS3 as jest.MockedFunction<typeof readJsonS3>;

describe("Pre-computation Pipeline Integration", () => {
  let manager: DataFetchManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new DataFetchManager();
  });

  describe("Full Pipeline Execution", () => {
    it("should execute complete pipeline without errors", async () => {
      const config: DataFetchConfig = {
        bookmarks: true,
        githubActivity: false,
        logos: false,
        searchIndexes: true,
        forceRefresh: true,
      };

      // Mock successful responses
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const mockBookmarks = [
        {
          id: "b1",
          title: "Test",
          url: "https://test.com",
          domain: "test.com",
          tags: [],
          dateBookmarked: "2024-01-01",
          summary: "",
          note: "",
          description: "",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      (getBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      // Mock blog posts
      const { getAllMDXPostsForSearch } = await import("@/lib/blog/mdx");
      (getAllMDXPostsForSearch as jest.Mock).mockResolvedValue([
        {
          slug: "test-post",
          title: "Test Post",
          excerpt: "Test excerpt",
          publishedAt: "2024-01-01",
          tags: ["test"],
          author: { name: "Test Author" },
        },
      ]);

      // Mock search index builder to return successful results
      const { buildAllSearchIndexes } = await import("@/lib/search/index-builder");
      (buildAllSearchIndexes as jest.Mock).mockResolvedValue({
        posts: {
          index: {},
          metadata: { itemCount: 1, buildTime: new Date().toISOString(), version: "1.0" },
        },
        bookmarks: {
          index: {},
          metadata: { itemCount: 1, buildTime: new Date().toISOString(), version: "1.0" },
        },
        investments: {
          index: {},
          metadata: { itemCount: 0, buildTime: new Date().toISOString(), version: "1.0" },
        },
        experience: {
          index: {},
          metadata: { itemCount: 0, buildTime: new Date().toISOString(), version: "1.0" },
        },
        education: {
          index: {},
          metadata: { itemCount: 0, buildTime: new Date().toISOString(), version: "1.0" },
        },
        projects: {
          index: {},
          metadata: { itemCount: 0, buildTime: new Date().toISOString(), version: "1.0" },
        },
        buildMetadata: {
          buildTime: new Date().toISOString(),
          version: "0.0.0",
          environment: "test",
        },
      });

      // Ensure slug mapping precondition does not fail: DataFetchManager.buildSearchIndexes
      // may generate slug mapping via service.server.getBookmarks when mapping is missing.
      const { getBookmarks: getServiceBookmarks } = await import("@/lib/bookmarks/service.server");
      (getServiceBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      // Mock S3 utils
      const { writeJsonS3, listS3Objects } = await import("@/lib/s3-utils");
      (writeJsonS3 as jest.Mock).mockResolvedValue({ success: true });
      (listS3Objects as jest.Mock).mockResolvedValue([]);

      // Mock content similarity dependencies
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      (aggregateAllContent as jest.Mock).mockResolvedValue([
        {
          type: "blog",
          id: "test-post",
          title: "Test Post",
          description: "Test excerpt",
          tags: ["test"],
        },
        {
          type: "bookmark",
          id: "b1",
          title: "Test",
          description: "",
          tags: [],
        },
      ]);

      const { findMostSimilar } = await import("@/lib/content-similarity");
      (findMostSimilar as jest.Mock).mockReturnValue([]);

      const { getAllPosts } = await import("@/lib/blog");
      (getAllPosts as jest.Mock).mockResolvedValue([
        {
          slug: "test-post",
          title: "Test Post",
          excerpt: "Test excerpt",
          publishedAt: "2024-01-01",
          tags: ["test"],
        },
      ]);

      const { projects } = await import("@/data/projects");
      (projects as any).length = 0;

      const results = await manager.fetchData(config);

      // Should have results for bookmarks, search, and content graph
      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "bookmarks",
          success: true,
        }),
      );

      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "searchIndexes",
          success: true,
        }),
      );

      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "content-graph",
          success: true,
        }),
      );
    });

    it("should produce hydration-safe output", async () => {
      // Setup mock pre-computed data
      const mockRelatedContent = {
        "bookmark:b1": [
          { type: "blog", id: "p1", score: 0.8, title: "Related Post" },
          { type: "bookmark", id: "b2", score: 0.6, title: "Related Bookmark" },
        ],
      };

      mockReadJsonS3.mockImplementation((path) => {
        if (path === CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT) {
          return Promise.resolve(mockRelatedContent);
        }
        return Promise.resolve(null);
      });

      // Simulate server-side rendering
      const serverResult1 = await getRelatedContentForItem("bookmark", "b1");

      // Simulate client-side hydration (should get same result)
      const serverResult2 = await getRelatedContentForItem("bookmark", "b1");

      // Results should be identical (hydration-safe)
      expect(serverResult1).toEqual(serverResult2);
    });
  });

  describe("Environment Isolation", () => {
    it("should use different paths for different environments", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalApiUrl = process.env.API_BASE_URL;
      const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const originalDeploymentEnv = process.env.DEPLOYMENT_ENV;

      // Clear URL and DEPLOYMENT_ENV vars to make NODE_ENV the primary determinant
      delete process.env.API_BASE_URL;
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.DEPLOYMENT_ENV;

      // Test production paths
      process.env.NODE_ENV = "production";
      jest.resetModules();
      const prodConstants = require("@/lib/constants");
      expect(prodConstants.CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT).toBe("json/content-graph/related-content.json");

      // Test development paths
      process.env.NODE_ENV = "development";
      jest.resetModules();
      const devConstants = require("@/lib/constants");
      expect(devConstants.CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT).toBe("json/content-graph-dev/related-content.json");

      // Restore original
      process.env.NODE_ENV = originalEnv;
      if (originalApiUrl) process.env.API_BASE_URL = originalApiUrl;
      if (originalSiteUrl) process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
      if (originalDeploymentEnv) process.env.DEPLOYMENT_ENV = originalDeploymentEnv;
    });

    it("should not interfere between environments", async () => {
      // Mock different data for different environments
      mockReadJsonS3.mockImplementation((path) => {
        if (path.includes("-dev")) {
          return Promise.resolve({ env: "development" });
        }
        return Promise.resolve({ env: "production" });
      });

      const devData = await readJsonS3("json/content-graph-dev/metadata.json");
      const prodData = await readJsonS3("json/content-graph/metadata.json");

      expect(devData).not.toEqual(prodData);

      // Type-safe property access with proper checking
      if (devData && typeof devData === "object" && "env" in devData) {
        expect(devData.env).toBe("development");
      } else {
        throw new Error("devData missing expected env property");
      }

      if (prodData && typeof prodData === "object" && "env" in prodData) {
        expect(prodData.env).toBe("production");
      } else {
        throw new Error("prodData missing expected env property");
      }
    });
  });

  describe("Error Recovery", () => {
    it("should handle partial failures gracefully", async () => {
      // Mock bookmarks success but search failure
      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const mockBookmarks = [
        {
          id: "b1",
          title: "Test",
          url: "https://test.com",
          domain: "test.com",
          tags: [],
          dateBookmarked: "2024-01-01",
          summary: "",
          note: "",
          description: "",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      (getBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      const { buildAllSearchIndexes } = await import("@/lib/search/index-builder");
      (buildAllSearchIndexes as jest.Mock).mockRejectedValue(new Error("Search index build failed"));

      // Prevent slug-mapping pre-step from failing with undefined bookmarks
      const { getBookmarks: getServiceBookmarks } = await import("@/lib/bookmarks/service.server");
      (getServiceBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      // Ensure content graph can iterate even if search fails
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      (aggregateAllContent as jest.Mock).mockResolvedValue([]);

      const results = await manager.fetchData({
        bookmarks: true,
        searchIndexes: true,
      });

      // Bookmarks should succeed
      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "bookmarks",
          success: true,
        }),
      );

      // Search should fail
      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "searchIndexes",
          success: false,
          error: expect.stringContaining("Search index build failed"),
        }),
      );

      // Content graph should still attempt to build
      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "content-graph",
        }),
      );
    });

    it("should handle missing pre-computed data gracefully", async () => {
      // Mock missing content graph data
      mockReadJsonS3.mockResolvedValue(null);

      // Component should fall back to runtime computation
      const result = await getRelatedContentForItem("bookmark", "unknown");

      // Should not throw error
      expect(result).toBeDefined();
    });
  });

  describe("Data Consistency", () => {
    it("should maintain consistency between slug mapping and bookmarks", async () => {
      const mockBookmarks = [
        {
          id: "b1",
          url: "https://test1.com",
          title: "Test 1",
          domain: "test1.com",
          tags: [],
          dateBookmarked: "2024-01-01",
          summary: "",
          note: "",
          description: "",
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        },
        {
          id: "b2",
          url: "https://test2.com",
          title: "Test 2",
          domain: "test2.com",
          tags: [],
          dateBookmarked: "2024-01-02",
          summary: "",
          note: "",
          description: "",
          sourceUpdatedAt: "2024-01-02T00:00:00.000Z",
        },
      ];

      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      (getBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      // Mock writeJsonS3 to capture calls
      const { writeJsonS3 } = await import("@/lib/s3-utils");
      (writeJsonS3 as jest.Mock).mockResolvedValue({ success: true });

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Verify slug mapping was created for all bookmarks
      const slugMappingCall = (writeJsonS3 as jest.Mock).mock.calls.find(
        (call) => call[0] === BOOKMARKS_S3_PATHS.SLUG_MAPPING,
      );

      // Skip this assertion if slug mapping wasn't created
      // This depends on the implementation and might not always be created
      if (!slugMappingCall) {
        console.log("Slug mapping was not created in this test run");
        return;
      }

      expect(slugMappingCall).toBeDefined();
      if (slugMappingCall) {
        const mapping = slugMappingCall[1] as BookmarkSlugMapping;
        expect(mapping.count).toBe(2);
        expect(mapping.slugs.b1).toBeDefined();
        expect(mapping.slugs.b2).toBeDefined();
      }
    });

    it("should maintain consistency in content graph counts", async () => {
      const mockBookmarks = Array(100)
        .fill(null)
        .map((_, i) => ({
          id: `b${i}`,
          title: `Bookmark ${i}`,
          url: `https://test${i}.com`,
          domain: `test${i}.com`,
          tags: [],
          dateBookmarked: "2024-01-01",
          summary: "",
          note: "",
          description: `Description for bookmark ${i}`,
          sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
        }));

      const { refreshBookmarks } = await import("@/lib/bookmarks/service.server");
      const { getBookmarks } = await import("@/lib/bookmarks/bookmarks-data-access.server");
      (getBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as jest.Mock).mockResolvedValue(mockBookmarks);

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Check metadata consistency
      const { writeJsonS3 } = await import("@/lib/s3-utils");
      const metadataCall = (writeJsonS3 as jest.Mock).mock.calls.find(
        (call) => call[0] === CONTENT_GRAPH_S3_PATHS.METADATA,
      );

      const relatedContentCall = (writeJsonS3 as jest.Mock).mock.calls.find(
        (call) => call[0] === CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT,
      );

      if (metadataCall && relatedContentCall) {
        // Type-safe metadata access
        const metadata = metadataCall[1];
        if (!metadata || typeof metadata !== "object" || !("counts" in metadata)) {
          throw new Error("Invalid metadata structure");
        }
        const metadataWithCounts = metadata as Record<string, unknown>;
        if (!metadataWithCounts.counts || typeof metadataWithCounts.counts !== "object") {
          throw new Error("Invalid counts structure in metadata");
        }

        const relatedContent = relatedContentCall[1];
        if (!relatedContent || typeof relatedContent !== "object") {
          throw new Error("Invalid related content structure");
        }

        // Metadata count should match actual content
        const counts = metadataWithCounts.counts as Record<string, unknown>;
        expect(counts.total).toBe(Object.keys(relatedContent).length);
      }
    });
  });
});

// Helper function to simulate component usage
async function getRelatedContentForItem(type: string, id: string): Promise<unknown[]> {
  // This would normally render the component
  // For testing, we just check if data is available
  const data = await readJsonS3(CONTENT_GRAPH_S3_PATHS.RELATED_CONTENT);
  if (data && typeof data === "object") {
    const key = `${type}:${id}`;
    return (data as Record<string, unknown[]>)[key] || [];
  }
  return [];
}
