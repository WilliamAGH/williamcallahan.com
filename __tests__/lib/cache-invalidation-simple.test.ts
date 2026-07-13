vi.mock("@/lib/data-access/opengraph");
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: vi.fn().mockResolvedValue([]),
  hybridSearchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

describe("Cache Invalidation Functions", () => {
  describe("Search Cache", () => {
    it("invalidates cached search results", async () => {
      const searchModule = await import("@/lib/search/cache-invalidation");
      const { searchBlogPostsServerSide } = await import("@/lib/blog/server-search");

      await expect(searchBlogPostsServerSide("javascript")).resolves.toEqual([]);
      expect(() => searchModule.invalidateSearchCache()).not.toThrow();
      expect(() => searchModule.invalidateSearchQueryCache("javascript")).not.toThrow();
      await expect(searchBlogPostsServerSide("javascript")).resolves.toEqual([]);
    });
  });

  describe("Bookmarks Cache", () => {
    it("executes the production bookmark invalidators", async () => {
      const cache = await import("@/lib/bookmarks/cache-management.server");

      expect(() => cache.invalidateNextJsBookmarksCache()).not.toThrow();
      expect(() => cache.invalidateTagCache("test")).not.toThrow();
      expect(() => cache.invalidatePageCache(1)).not.toThrow();
    });
  });

  describe("Blog Cache", () => {
    it("invalidates cached blog posts", async () => {
      const { getAllPosts } = await import("@/lib/blog");
      const blogModule = await import("@/lib/blog/mdx");
      const posts = await getAllPosts();

      expect(posts.length).toBeGreaterThan(0);
      expect(() => blogModule.invalidateBlogCache()).not.toThrow();
      expect(() => blogModule.invalidateBlogPostCache("test-slug")).not.toThrow();
      await expect(getAllPosts()).resolves.toHaveLength(posts.length);
    });
  });
});
