/**
 * Blog Module Tests
 *
 * Tests the core blog functionality including:
 * 1. Post Management
 *    - Retrieval of posts from the canonical MDX source
 *    - Proper sorting by publish date (newest first)
 *    - Validation of required post fields
 *
 * 2. Post Lookup
 *    - Finding posts by slug
 *    - Handling non-existent slugs
 *
 * Test Data:
 * - Uses mock posts with controlled dates and fields
 * - Mocks MDX functionality
 * - Tests edge cases like missing posts
 */

import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { findBlogPostFilePath, isValidBlogSlug } from "@/lib/blog/validation";
import { cacheContextGuards } from "@/lib/cache";
import { GET as getPostsApi } from "@/app/api/posts/route";
import type { BlogPost } from "@/types/blog";
// Vitest provides describe, it, expect, beforeEach, afterEach, beforeAll, afterAll globally

vi.mock("@/lib/cache", () => ({
  USE_NEXTJS_CACHE: true,
  cacheContextGuards: {
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    revalidateTag: vi.fn(),
  },
}));

vi.mock("@/lib/blog/validation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blog/validation")>()),
  findBlogPostFilePath: vi.fn(),
}));

// Mock MDX functionality using mock.module
const { mockMdxPosts } = vi.hoisted(() => ({
  mockMdxPosts: [
    {
      id: "test-post-1",
      title: "Test Post 1",
      slug: "test-post-1",
      excerpt: "Test excerpt 1",
      content: { compiledSource: "Test content 1", scope: {}, frontmatter: {} },
      publishedAt: "2024-03-14T12:00:00Z",
      author: {
        id: "william-callahan",
        name: "William Callahan",
      },
      coverImage: "https://example.com/image1.jpg",
      tags: ["test"],
    },
    {
      id: "test-post-2",
      title: "Test Post 2",
      slug: "test-post-2",
      excerpt: "Test excerpt 2",
      content: { compiledSource: "Test content 2", scope: {}, frontmatter: {} },
      publishedAt: "2024-03-13T12:00:00Z",
      author: {
        id: "william-callahan",
        name: "William Callahan",
      },
      coverImage: "https://example.com/image2.jpg",
      tags: ["test"],
    },
  ] satisfies BlogPost[],
}));

vi.mock("@/lib/blog/mdx", () => ({
  getAllMDXPostsCached: vi.fn().mockImplementation(() => Promise.resolve(mockMdxPosts)),
  getMDXPost: vi.fn().mockImplementation((slug: string) => {
    const post = mockMdxPosts.find((p) => p.slug === slug);
    return Promise.resolve(post === undefined ? null : post);
  }),
  getMDXPostCached: vi.fn().mockImplementation((slug: string) => {
    const post = mockMdxPosts.find((p) => p.slug === slug);
    return Promise.resolve(post === undefined ? null : post);
  }),
}));

describe("Blog Module", () => {
  const cacheLifeSpy = vi.mocked(cacheContextGuards.cacheLife);

  beforeEach(() => {
    cacheLifeSpy.mockClear();
    vi.mocked(findBlogPostFilePath).mockImplementation(async (slug) =>
      mockMdxPosts.some((post) => post.slug === slug) ? `/posts/${slug}.mdx` : undefined,
    );
  });

  describe("getAllPosts", () => {
    /**
     * Test: Post Retrieval and Sorting
     *
     * Verifies:
     * 1. Posts are retrieved successfully
     * 2. Each post has all required fields
     * 3. Posts are sorted by date in descending order
     *
     * Expected Behavior:
     * - Returns array of posts with all required fields
     * - Posts are sorted with newest first (by publishedAt)
     */
    it("returns posts sorted by date in descending order", async () => {
      const posts = await getAllPosts();

      // Verify required fields
      for (const post of posts) {
        expect(post).toHaveProperty("id");
        expect(post).toHaveProperty("title");
        expect(post).toHaveProperty("slug");
        expect(post).toHaveProperty("content");
      }

      // Verify sorting
      const dates = posts.map((post) => new Date(post.publishedAt).getTime());
      expect(dates).toEqual([...dates].toSorted((a, b) => b - a));
    });
  });

  describe("getPostBySlug", () => {
    /**
     * Test: Single Post Retrieval
     *
     * Verifies:
     * 1. Correct post is returned for valid slug
     * 2. Returns null for non-existent slug
     * 3. Post data matches expected format
     *
     * Expected Behavior:
     * - Returns full post object for valid slug
     * - Returns null for invalid/non-existent slug (allowing graceful 404 handling)
     */
    it("returns correct post for valid slug", async () => {
      const post = await getPostBySlug("test-post-1");
      expect(post).toBeTruthy();
      expect(post?.slug).toBe("test-post-1");
      expect(post?.title).toBe("Test Post 1");
    });

    it("returns null for non-existent slug", async () => {
      const post = await getPostBySlug("non-existent");
      expect(post).toBeNull();
    });
  });

  describe("isValidBlogSlug", () => {
    it("rejects values that must not enter route cache keys", () => {
      expect(isValidBlogSlug("valid-blog-slug")).toBe(true);
      expect(isValidBlogSlug("../../../etc/passwd")).toBe(false);
      expect(isValidBlogSlug("double--hyphen")).toBe(false);
      expect(isValidBlogSlug(" valid-blog-slug ")).toBe(false);
      expect(isValidBlogSlug("a".repeat(201))).toBe(false);
    });
  });

  describe("Posts API caching", () => {
    it("applies cacheLife when serving posts", async () => {
      const response = await getPostsApi();
      expect(response.status).toBe(200);
      expect(cacheLifeSpy).toHaveBeenCalledWith("PostsAPI", "hours");
    });
  });
});
