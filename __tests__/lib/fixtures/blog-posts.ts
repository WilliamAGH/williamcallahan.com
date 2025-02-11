/**
 * Blog Test Fixtures
 * @module __tests__/lib/fixtures/blog-posts
 * @description
 * Test data for blog-related tests with controlled dates and fields.
 * Includes posts with both PST and PDT timezone scenarios.
 */

import type { BlogPost } from '../../../types/blog';
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';

// Mock MDX content for testing
const createMockMDX = (content: string): MDXRemoteSerializeResult => ({
  compiledSource: content,
  frontmatter: {},
  scope: {}
});

/**
 * Test blog posts with different timezone scenarios
 */
export const TEST_POSTS: BlogPost[] = [
  // Winter (PST) post
  {
    id: 'test-post-1',
    title: 'Test Post 1',
    slug: 'test-post-1',
    excerpt: 'Test excerpt 1',
    content: createMockMDX('Test content 1'),
    publishedAt: '2024-01-14T12:00:00-08:00', // PST
    author: {
      id: 'william-callahan',
      name: 'William Callahan'
    },
    coverImage: 'https://example.com/image1.jpg',
    tags: ['test'],
    readingTime: 5
  },
  // Summer (PDT) post
  {
    id: 'test-post-2',
    title: 'Test Post 2',
    slug: 'test-post-2',
    excerpt: 'Test excerpt 2',
    content: createMockMDX('Test content 2'),
    publishedAt: '2024-07-13T12:00:00-07:00', // PDT
    author: {
      id: 'william-callahan',
      name: 'William Callahan'
    },
    coverImage: 'https://example.com/image2.jpg',
    tags: ['test'],
    readingTime: 3
  }
];
