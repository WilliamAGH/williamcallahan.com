/**
 * Blog Module Tests
 *
 * @module __tests__/lib/blog
 * @description Tests blog functionality including post handling and MDX processing
 */

// Import mock data first to avoid initialization issues
import { mockBlog } from '@/__tests__/lib/fixtures/mockBlog';

// Import other dependencies after mock data
import { getAllPosts, getPostBySlug } from '@/lib/blog';
import { TEST_POSTS, TEST_POST } from '@/__tests__/lib/fixtures/mockBlog';
import { sortDates } from '@/lib/dateTime';

// Mock blog posts - using mockBlog that was imported first
jest.mock('@/data/blog/posts', () => ({
  posts: mockBlog.posts
}));

// Mock MDX functionality
jest.mock('next-mdx-remote/serialize', () => ({
  serialize: jest.fn().mockResolvedValue(mockBlog.mdxResult)
}));

// Mock rehype plugins
jest.mock('rehype-prism', () => jest.fn());

jest.mock('@/lib/server/mdx', () => ({
  getAllMDXPosts: jest.fn().mockResolvedValue([]),
  getMDXPost: jest.fn().mockImplementation((slug: string) => {
    const post = TEST_POSTS.find((p: { slug: string }) => p.slug === slug);
    return Promise.resolve(post || null);
  })
}));

describe('Blog Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllPosts', () => {
    /**
     * Test: Post Retrieval and Sorting
     *
     * Verifies:
     * 1. Posts are retrieved successfully
     * 2. Each post has all required fields
     * 3. Posts are sorted by date in descending order
     * 4. Proper timezone handling for both PST and PDT dates
     *
     * Expected Behavior:
     * - Returns array of posts with all required fields
     * - Posts are sorted with newest first (by publishedAt)
     * - Dates maintain correct timezone offsets
     */
    it('returns posts sorted by date in descending order', async () => {
      const posts = await getAllPosts();

      // Verify required fields
      for (const post of posts) {
        expect(post).toHaveProperty('id');
        expect(post).toHaveProperty('title');
        expect(post).toHaveProperty('slug');
        expect(post).toHaveProperty('content');
        expect(post).toHaveProperty('publishedAt');

        // Verify timezone offset is present
        expect(post.publishedAt).toMatch(/[+-]\d{2}:00$/);
      }

      // Verify sorting
      const publishDates = posts.map(post => post.publishedAt);
      const sortedDates = [...publishDates].sort(sortDates);
      expect(publishDates).toEqual(sortedDates);
    });

    it('handles both PST and PDT dates correctly', async () => {
      const posts = await getAllPosts();

      // Find winter (PST) and summer (PDT) posts
      const winterPost = posts.find(p => p.publishedAt.includes('-08:00'));
      const summerPost = posts.find(p => p.publishedAt.includes('-07:00'));

      expect(winterPost).toBeTruthy();
      expect(summerPost).toBeTruthy();

      // Verify correct timezone offsets
      expect(winterPost?.publishedAt).toMatch(/-08:00$/);
      expect(summerPost?.publishedAt).toMatch(/-07:00$/);
    });
  });

  describe('getPostBySlug', () => {
    /**
     * Test: Single Post Retrieval
     *
     * Verifies:
     * 1. Correct post is returned for valid slug
     * 2. Null is returned for non-existent slug
     * 3. Post data matches expected format
     *
     * Expected Behavior:
     * - Returns full post object for valid slug
     * - Returns null for invalid/non-existent slug
     */
    it('returns correct post for valid slug', async () => {
      const post = await getPostBySlug('test-post-1');
      expect(post).toBeTruthy();
      expect(post?.slug).toBe('test-post-1');
      expect(post?.title).toBe('Test Post 1');
      // Get the expected post from TEST_POSTS array
      const expectedPost = TEST_POSTS.find(p => p.slug === 'test-post-1');
      expect(post?.publishedAt).toBe(expectedPost?.publishedAt);
      expect(post?.updatedAt).toBe(expectedPost?.updatedAt);
    });

    it('returns null for non-existent slug', async () => {
      const post = await getPostBySlug('non-existent');
      expect(post).toBeNull();
    });
  });
});
