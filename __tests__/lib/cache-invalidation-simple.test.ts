/**
 * Simple test to verify cache invalidation functions exist and can be called
 */

// Mock the github module before imports
jest.mock("@/lib/data-access/github");

describe("Cache Invalidation Functions", () => {
  describe("Search Cache", () => {
    it("should have invalidation functions", async () => {
      // Dynamically import to avoid module loading issues
      const searchModule = await import("@/lib/search");

      expect(searchModule.invalidateSearchCache).toBeDefined();
      expect(typeof searchModule.invalidateSearchCache).toBe("function");

      expect(searchModule.invalidateSearchQueryCache).toBeDefined();
      expect(typeof searchModule.invalidateSearchQueryCache).toBe("function");

      // Test that functions can be called without errors
      expect(() => searchModule.invalidateSearchCache()).not.toThrow();
      expect(() => searchModule.invalidateSearchQueryCache("test")).not.toThrow();
    });
  });

  describe("Bookmarks Cache", () => {
    it("should have invalidation functions", async () => {
      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");

      expect(bookmarksModule.invalidateBookmarksCache).toBeDefined();
      expect(typeof bookmarksModule.invalidateBookmarksCache).toBe("function");

      expect(bookmarksModule.invalidateTagCache).toBeDefined();
      expect(typeof bookmarksModule.invalidateTagCache).toBe("function");

      expect(bookmarksModule.invalidateBookmarkCache).toBeDefined();
      expect(typeof bookmarksModule.invalidateBookmarkCache).toBe("function");

      // Test that functions can be called without errors
      expect(() => bookmarksModule.invalidateBookmarksCache()).not.toThrow();
      expect(() => bookmarksModule.invalidateTagCache("test")).not.toThrow();
      expect(() => bookmarksModule.invalidateBookmarkCache("test")).not.toThrow();
    });
  });

  describe("Blog Cache", () => {
    it("should have invalidation functions", async () => {
      const blogModule = await import("@/lib/blog/mdx");

      expect(blogModule.invalidateBlogCache).toBeDefined();
      expect(typeof blogModule.invalidateBlogCache).toBe("function");

      expect(blogModule.invalidateBlogPostCache).toBeDefined();
      expect(typeof blogModule.invalidateBlogPostCache).toBe("function");

      // Test that functions can be called without errors
      expect(() => blogModule.invalidateBlogCache()).not.toThrow();
      expect(() => blogModule.invalidateBlogPostCache("test-slug")).not.toThrow();
    });
  });

  describe.skip("GitHub Cache (Mocked)", () => {
    it("should have invalidation function", async () => {
      // Clear module cache and use our mock
      jest.resetModules();
      const githubModule = await import("@/lib/data-access/github");

      expect(githubModule.invalidateGitHubCache).toBeDefined();
      expect(typeof githubModule.invalidateGitHubCache).toBe("function");

      // Test that function can be called without errors
      expect(() => githubModule.invalidateGitHubCache()).not.toThrow();
    });
  });
});
