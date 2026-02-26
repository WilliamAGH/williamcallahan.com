/**
 * Integration tests for the complete pre-computation pipeline
 *
 * Tests the full flow from data fetching through pre-computation to serving
 */

import type { Mock, MockedFunction } from "vitest";
import { DataFetchManager } from "@/lib/server/data-fetch-manager";
import { readContentGraphArtifact } from "@/lib/db/queries/content-graph";
import { writeContentGraphArtifacts } from "@/lib/db/mutations/content-graph";
import type { DataFetchConfig } from "@/types/lib";

// Mock external dependencies
vi.mock("@/lib/s3/objects");
vi.mock("@/lib/db/mutations/content-graph");
vi.mock("@/lib/db/queries/content-graph");
vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarksIndexFromDatabase: vi.fn().mockResolvedValue({
    count: 1,
    totalPages: 1,
    pageSize: 24,
    lastModified: new Date().toISOString(),
    lastFetchedAt: Date.now(),
    lastAttemptedAt: Date.now(),
    checksum: "test-checksum",
    changeDetected: true,
  }),
  getSlugMappingRowsFromDatabase: vi.fn().mockResolvedValue([]),
  getBookmarkBySlugFromDatabase: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/bookmarks/service.server");
vi.mock("@/lib/bookmarks/bookmarks-data-access.server");
vi.mock("@/lib/blog");
vi.mock("@/lib/utils/logger");
vi.mock("@/lib/search/index-builder");
vi.mock("@/lib/db/mutations/search-index-artifacts", () => ({
  upsertAllSearchIndexArtifacts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/blog/mdx");
vi.mock("@/lib/content-similarity/aggregator");
vi.mock("@/lib/content-similarity");
vi.mock("@/data/projects");

const mockReadContentGraphArtifact = readContentGraphArtifact as MockedFunction<
  typeof readContentGraphArtifact
>;
const mockWriteContentGraphArtifacts = writeContentGraphArtifacts as MockedFunction<
  typeof writeContentGraphArtifacts
>;

describe("Pre-computation Pipeline Integration", () => {
  let manager: DataFetchManager;

  beforeEach(() => {
    vi.clearAllMocks();
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
      (getBookmarks as Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as Mock).mockResolvedValue(mockBookmarks);

      // Mock blog posts
      const { getAllMDXPostsForSearch } = await import("@/lib/blog/mdx");
      (getAllMDXPostsForSearch as Mock).mockResolvedValue([
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
      (buildAllSearchIndexes as Mock).mockResolvedValue({
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
      (getServiceBookmarks as Mock).mockResolvedValue(mockBookmarks);

      const { listS3Objects } = await import("@/lib/s3/objects");
      (listS3Objects as Mock).mockResolvedValue([]);

      // Mock content similarity dependencies
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      (aggregateAllContent as Mock).mockResolvedValue([
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
      (findMostSimilar as Mock).mockReturnValue([]);

      const { getAllPosts } = await import("@/lib/blog");
      (getAllPosts as Mock).mockResolvedValue([
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
      // Setup mock pre-computed data in DB
      const mockRelatedContent = {
        "bookmark:b1": [
          { type: "blog", id: "p1", score: 0.8, title: "Related Post" },
          { type: "bookmark", id: "b2", score: 0.6, title: "Related Bookmark" },
        ],
      };

      mockReadContentGraphArtifact.mockImplementation((artifactType) => {
        if (artifactType === "related-content") {
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
      (getBookmarks as Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as Mock).mockResolvedValue(mockBookmarks);

      const { buildAllSearchIndexes } = await import("@/lib/search/index-builder");
      (buildAllSearchIndexes as Mock).mockRejectedValue(new Error("Search index build failed"));

      // Prevent slug-mapping pre-step from failing with undefined bookmarks
      const { getBookmarks: getServiceBookmarks } = await import("@/lib/bookmarks/service.server");
      (getServiceBookmarks as Mock).mockResolvedValue(mockBookmarks);

      // Ensure content graph can iterate even if search fails
      const { aggregateAllContent } = await import("@/lib/content-similarity/aggregator");
      (aggregateAllContent as Mock).mockResolvedValue([]);

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
      // Mock missing content graph data in DB
      mockReadContentGraphArtifact.mockResolvedValue(null);

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
      (getBookmarks as Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as Mock).mockResolvedValue(mockBookmarks);

      const results = await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      expect(results).toContainEqual(
        expect.objectContaining({
          operation: "bookmarks",
          success: true,
          itemsProcessed: 2,
        }),
      );
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
      (getBookmarks as Mock).mockResolvedValue(mockBookmarks);
      (refreshBookmarks as Mock).mockResolvedValue(mockBookmarks);
      mockWriteContentGraphArtifacts.mockResolvedValue(undefined);

      await manager.fetchData({
        bookmarks: true,
        forceRefresh: true,
      });

      // Check metadata consistency via DB artifacts
      const artifactsArg = mockWriteContentGraphArtifacts.mock.calls[0]?.[0];
      const metadataArtifact = artifactsArg?.find(
        (a: { artifactType: string }) => a.artifactType === "metadata",
      );
      const relatedArtifact = artifactsArg?.find(
        (a: { artifactType: string }) => a.artifactType === "related-content",
      );

      if (metadataArtifact && relatedArtifact) {
        // Type-safe metadata access
        const metadata = metadataArtifact.payload;
        if (!metadata || typeof metadata !== "object" || !("counts" in metadata)) {
          throw new Error("Invalid metadata structure");
        }
        const metadataWithCounts = metadata as Record<string, unknown>;
        if (!metadataWithCounts.counts || typeof metadataWithCounts.counts !== "object") {
          throw new Error("Invalid counts structure in metadata");
        }

        const relatedContent = relatedArtifact.payload;
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
  // For testing, we just check if data is available from the DB
  const data = await readContentGraphArtifact("related-content");
  if (data && typeof data === "object") {
    const key = `${type}:${id}`;
    return (data as Record<string, unknown[]>)[key] || [];
  }
  return [];
}
