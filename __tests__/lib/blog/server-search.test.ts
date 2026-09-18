/**
 * searchBlogPostsServerSide returns rows in the order the hybrid query ranked
 * them. Reciprocal-rank scores differ by less than 0.01 between neighbors, so
 * any recency re-sort with a score epsilon would silently replace relevance
 * order with date order.
 */

import { describe, expect, it, vi } from "vitest";

const { mockHybridSearchBlogPosts } = vi.hoisted(() => ({
  mockHybridSearchBlogPosts: vi.fn(),
}));
vi.mock("@/lib/db/queries/hybrid-search-books-blog", () => ({
  hybridSearchBlogPosts: mockHybridSearchBlogPosts,
}));
vi.mock("@/lib/db/queries/query-embedding", () => ({
  buildQueryEmbedding: vi.fn().mockResolvedValue(undefined),
}));

import { searchBlogPostsServerSide } from "@/lib/blog/server-search";

const row = (slug: string, score: number, publishedAt: string) => ({
  id: slug,
  title: slug,
  slug,
  excerpt: null,
  authorName: "William",
  tags: null,
  publishedAt,
  score,
});

describe("searchBlogPostsServerSide", () => {
  it("keeps the hybrid ranking when an older post outranks a newer one by a small margin", async () => {
    mockHybridSearchBlogPosts.mockResolvedValueOnce([
      row("older-but-relevant", 1 / 61 + 1 / 62, "2023-01-01"),
      row("newer-but-weaker", 1 / 61, "2026-01-01"),
      row("newest-and-weakest", 1 / 63, "2026-06-01"),
    ]);

    const results = await searchBlogPostsServerSide("postgres");

    expect(results.map((r) => r.url)).toEqual([
      "/blog/older-but-relevant",
      "/blog/newer-but-weaker",
      "/blog/newest-and-weakest",
    ]);
    expect(results[0]).not.toHaveProperty("publishedAt");
  });
});
