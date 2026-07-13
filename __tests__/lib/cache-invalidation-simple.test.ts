vi.mock("@/lib/data-access/github");
vi.mock("@/lib/data-access/opengraph");
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: vi.fn().mockResolvedValue([]),
  hybridSearchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  getBookmarksPage: vi.fn().mockResolvedValue([]),
  invalidateBookmarksCache: vi.fn(),
  invalidateBookmarksPageCache: vi.fn(),
  invalidateTagCache: vi.fn(),
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
    it("invalidates cached bookmark pages", async () => {
      const bookmarksModule = await import("@/lib/bookmarks/bookmarks-data-access.server");
      const page = await bookmarksModule.getBookmarksPage(1);

      expect(page).toEqual([]);
      expect(() => bookmarksModule.invalidateBookmarksCache()).not.toThrow();
      expect(() => bookmarksModule.invalidateTagCache("test")).not.toThrow();
      expect(() => bookmarksModule.invalidateBookmarksPageCache(1)).not.toThrow();
      await expect(bookmarksModule.getBookmarksPage(1)).resolves.toHaveLength(page.length);
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

  describe("GitHub Cache (Mocked)", () => {
    it("should expose cached activity readers", async () => {
      vi.resetModules();
      const githubModule = await import("@/lib/data-access/github");

      expect(githubModule.refreshGitHubActivityDataFromApi).toBeDefined();
      expect(typeof githubModule.refreshGitHubActivityDataFromApi).toBe("function");
      const githubPublicModule = await import("@/lib/data-access/github-public-api");
      expect(githubPublicModule.getGithubActivityCached).toBeDefined();
      expect(typeof githubPublicModule.getGithubActivityCached).toBe("function");
    });
  });
});
