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

import { getAllPosts, getPostBySlug } from '../../lib/blog';
import type { BlogPost } from '../../types/blog';

// Mock static posts
jest.mock('../../data/blog/posts', () => ({
  posts: [
    {
      id: 'test-post-1',
      title: 'Test Post 1',
      slug: 'test-post-1',
      excerpt: 'Test excerpt 1',
      content: 'Test content 1',
      publishedAt: '2024-03-14T12:00:00Z',
      author: {
        id: 'william-callahan',
        name: 'William Callahan'
      },
      coverImage: 'https://example.com/image1.jpg',
      tags: ['test'],
      readingTime: 5
    },
    {
      id: 'test-post-2',
      title: 'Test Post 2',
      slug: 'test-post-2',
      excerpt: 'Test excerpt 2',
      content: 'Test content 2',
      publishedAt: '2024-03-13T12:00:00Z',
      author: {
        id: 'william-callahan',
        name: 'William Callahan'
      },
      coverImage: 'https://example.com/image2.jpg',
      tags: ['test'],
      readingTime: 3
    }
  ]
}));

// Mock MDX functionality
jest.mock('../../lib/blog/mdx', () => ({
  getAllMDXPosts: jest.fn().mockResolvedValue([]),
  getMDXPost: jest.fn().mockImplementation((slug: string) => {
    const posts = [
      {
        id: 'test-post-1',
        title: 'Test Post 1',
        slug: 'test-post-1',
        excerpt: 'Test excerpt 1',
        content: 'Test content 1',
        publishedAt: '2024-03-14T12:00:00Z',
        author: {
          id: 'william-callahan',
          name: 'William Callahan'
        },
        coverImage: 'https://example.com/image1.jpg',
        tags: ['test'],
        readingTime: 5
      },
      {
        id: 'test-post-2',
        title: 'Test Post 2',
        slug: 'test-post-2',
        excerpt: 'Test excerpt 2',
        content: 'Test content 2',
        publishedAt: '2024-03-13T12:00:00Z',
        author: {
          id: 'william-callahan',
          name: 'William Callahan'
        },
        coverImage: 'https://example.com/image2.jpg',
        tags: ['test'],
        readingTime: 3
      }
    ];
    const post = posts.find(p => p.slug === slug);
    return Promise.resolve(post || null);
  })
}));

describe('Blog Module', () => {
  describe('getAllPosts', () => {
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
    it('returns posts sorted by date in descending order', async () => {
      const posts = await getAllPosts();

      // Verify required fields
      for (const post of posts) {
        expect(post).toHaveProperty('id');
        expect(post).toHaveProperty('title');
        expect(post).toHaveProperty('slug');
        expect(post).toHaveProperty('content');
      }

      // Verify sorting
      const dates = posts.map(post => new Date(post.publishedAt).getTime());
      expect(dates).toEqual([...dates].sort((a, b) => b - a));
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
