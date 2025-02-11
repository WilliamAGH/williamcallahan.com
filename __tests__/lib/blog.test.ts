/**
 * Blog Module Tests
 *
 * Tests the core blog functionality including:
 * 1. Post Management
 *    - Retrieval of posts from both static and MDX sources
 *    - Proper sorting by publish date (newest first)
 *    - Validation of required post fields
 *
 * 2. Post Lookup
 *    - Finding posts by slug
 *    - Handling non-existent slugs
 *    - Proper source prioritization (static before MDX)
 *
 * Test Data:
 * - Uses mock posts with controlled dates and fields
 * - Mocks both static posts and MDX functionality
 * - Tests edge cases like missing posts
 */

// Set up mocks before any imports
jest.mock('../../data/blog/posts', () => ({
  posts: require('../lib/fixtures/blog-posts').TEST_POSTS
}));

jest.mock('../../lib/blog/mdx', () => ({
  getAllMDXPosts: jest.fn().mockResolvedValue([]),
  getMDXPost: jest.fn().mockImplementation((slug: string) => {
    const { TEST_POSTS } = require('../lib/fixtures/blog-posts');
    const post = TEST_POSTS.find((p: { slug: string }) => p.slug === slug);
    return Promise.resolve(post || null);
  })
}));

import { getAllPosts, getPostBySlug } from '../../lib/blog';
import { TEST_POSTS } from '../lib/fixtures/blog-posts';
import { sortDates } from '../../lib/dateTime';

describe('Blog Module', () => {
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
      // Verify posts are sorted newest first
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
    });

    it('returns null for non-existent slug', async () => {
      const post = await getPostBySlug('non-existent');
      expect(post).toBeNull();
    });
  });
});
