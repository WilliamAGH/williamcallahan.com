/**
 * Mock Blog Data
 *
 * Provides test data for blog-related tests.
 * CRITICAL: This file must be imported before other blog-related imports
 * to ensure proper mock initialization.
 */

import type { BlogPost } from '@/types/blog';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';

/**
 * Mock MDX result for testing
 */
export const mockMdxResult: MDXRemoteSerializeResult = {
  compiledSource: 'Test content',
  frontmatter: {},
  scope: {}
};

/**
 * Mock blog posts with both PST and PDT dates
 */
export const mockBlogPosts: BlogPost[] = [
  {
    id: 'test-post-1',
    title: 'Test Post 1',
    excerpt: 'Test excerpt 1',
    content: { compiledSource: 'Test content 1', frontmatter: {}, scope: {} },
    author: { id: 'test-author', name: 'Test Author', avatar: '/test-avatar.jpg' },
    slug: 'test-post-1',
    publishedAt: '2024-01-01T12:00:00-08:00', // PST
    updatedAt: '2024-01-02T12:00:00-08:00',
    readingTime: 5,
    tags: ['test']
  },
  {
    id: 'test-post-2',
    title: 'Test Post 2',
    excerpt: 'Test excerpt 2',
    content: { compiledSource: 'Test content 2', frontmatter: {}, scope: {} },
    author: { id: 'test-author', name: 'Test Author', avatar: '/test-avatar.jpg' },
    slug: 'test-post-2',
    publishedAt: '2024-07-03T12:00:00-07:00', // PDT
    updatedAt: '2024-07-04T12:00:00-07:00',
    readingTime: 3,
    tags: ['test']
  }
];

/**
 * Single test post for individual post tests
 */
export const mockBlogPost = mockBlogPosts[0];

/**
 * Complete mock blog data for tests
 */
export const mockBlog = {
  posts: mockBlogPosts,
  mdxResult: mockMdxResult
};

// Backwards compatibility exports
export const TEST_POSTS = mockBlogPosts;
export const TEST_POST = mockBlogPost;

export default mockBlog;
