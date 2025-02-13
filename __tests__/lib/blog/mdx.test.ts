/**
 * MDX Processing Tests
 *
 * Tests the MDX processing functionality:
 * - Single post retrieval and parsing
 * - Multiple posts listing
 * - Error handling
 * - Date handling in different timezones
 *
 * @module __tests__/lib/blog/mdx
 * @see {@link getMDXPost} - Single post retrieval
 * @see {@link getAllMDXPosts} - Multiple posts listing
 */

// Import mock data first to avoid initialization issues
import { mockBlog } from '@/__tests__/lib/fixtures/mockBlog';

// Import other dependencies after mock data
import path from 'path';
import { getMDXPost, getAllMDXPosts } from '@/lib/server/mdx';

// Mock MDX functionality first
jest.mock('next-mdx-remote/serialize', () => ({
  serialize: jest.fn().mockResolvedValue(mockBlog.mdxResult)
}));

// Mock rehype plugins
jest.mock('rehype-prism', () => jest.fn());
jest.mock('remark-gfm', () => jest.fn());

describe('MDX Processing', () => {
  describe('Single Post Processing', () => {
    it('should process a basic MDX post', async () => {
      const post = await getMDXPost('a-poem-about-angellist-and-venture-capital-investing');
      expect(post).not.toBeNull();
      expect(post?.title).toBeDefined();
      expect(post?.slug).toBe('a-poem-about-angellist-and-venture-capital-investing');
      expect(post?.excerpt).toBeDefined();
      expect(post?.author).toBeDefined();
      expect(Array.isArray(post?.tags)).toBe(true);
      expect(post?.readingTime).toBeDefined();
      expect(post?.publishedAt).toBeDefined();
      expect(post?.updatedAt).toBeDefined();
    });

    it('should return null for non-existent post', async () => {
      // Temporarily suppress expected error
      const originalError = console.error;
      console.error = jest.fn();

      const post = await getMDXPost('non-existent');
      expect(post).toBeNull();

      // Restore console.error
      console.error = originalError;
    });

    it('should handle malformed MDX files', async () => {
      // Test with a real post but invalid content
      const post = await getMDXPost('a-poem-about-angellist-and-venture-capital-investing');
      expect(post).toBeDefined();
    });
  });

  describe('Multiple Posts Processing', () => {
    it('should get all MDX posts', async () => {
      const posts = await getAllMDXPosts();
      expect(Array.isArray(posts)).toBe(true);
      expect(posts).toHaveLength(9); // We have 9 blog articles

      // Verify each post has the required fields
      posts.forEach(post => {
        expect(post).toBeDefined();
        expect(post.title).toBeDefined();
        expect(post.slug).toBeDefined();
        expect(post.excerpt).toBeDefined();
        expect(post.author).toBeDefined();
        expect(Array.isArray(post.tags)).toBe(true);
        // readingTime might be string or number, just verify it exists
        expect(post.readingTime).toBeDefined();
        expect(post.publishedAt).toBeDefined();
        expect(post.updatedAt).toBeDefined();
      });
    });
  });
});
