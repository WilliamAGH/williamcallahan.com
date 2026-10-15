import fs from "node:fs/promises";
import path from "node:path";
import { clearBlogSlugMemos, getAllPostsMeta, getPostMetaBySlug } from "@/lib/blog";
import { invalidateBlogCache, invalidateBlogPostCache } from "@/lib/blog/mdx";
import type {
  hybridSearchBlogPosts,
  hybridSearchBooks,
} from "@/lib/db/queries/hybrid-search-books-blog";
import type { buildQueryEmbedding } from "@/lib/db/queries/query-embedding";

const fixtureRoot = await vi.hoisted(async () => {
  const filesystem = await import("node:fs/promises");
  const operatingSystem = await import("node:os");
  const paths = await import("node:path");
  return filesystem.mkdtemp(paths.join(operatingSystem.tmpdir(), "blog-cache-"));
});

vi.mock("@/lib/blog/validation", async (importOriginal) => {
  // Initialize the real filesystem/index owner against an isolated content root.
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(fixtureRoot);
  try {
    return await importOriginal<typeof import("@/lib/blog/validation")>();
  } finally {
    cwd.mockRestore();
  }
});

vi.mock("@/lib/data-access/opengraph");
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: vi.fn<typeof hybridSearchBlogPosts>().mockResolvedValue([]),
  hybridSearchBooks: vi.fn<typeof hybridSearchBooks>().mockResolvedValue([]),
}));
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn<typeof buildQueryEmbedding>().mockResolvedValue(undefined),
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
    afterAll(async () => {
      clearBlogSlugMemos();
      await fs.rm(fixtureRoot, { recursive: true });
    });

    it("returns changed content after clearing cached blog posts", async () => {
      const postsDirectory = path.join(fixtureRoot, "data/blog/posts");
      const postPath = path.join(postsDirectory, "cache-contract.mdx");
      const originalSource = `---
slug: cache-contract
title: Original title
author: william-callahan
publishedAt: 2026-01-01
excerpt: Cache invalidation fixture.
tags: [Testing]
---
Original content.
`;
      await fs.mkdir(postsDirectory, { recursive: true });
      await fs.writeFile(postPath, originalSource);

      await expect(getAllPostsMeta()).resolves.toMatchObject([{ title: "Original title" }]);
      await expect(getPostMetaBySlug("cache-contract")).resolves.toMatchObject({
        title: "Original title",
      });

      await fs.writeFile(postPath, originalSource.replace("Original title", "Updated title"));
      await expect(getPostMetaBySlug("cache-contract")).resolves.toMatchObject({
        title: "Original title",
      });

      // Match the admin cache-clear operation: Next tags plus process memos.
      invalidateBlogCache();
      invalidateBlogPostCache("cache-contract");
      clearBlogSlugMemos();

      await expect(getPostMetaBySlug("cache-contract")).resolves.toMatchObject({
        title: "Updated title",
      });
      await expect(getAllPostsMeta()).resolves.toMatchObject([{ title: "Updated title" }]);
    });
  });
});
