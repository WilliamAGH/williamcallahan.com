// __tests__/lib/fixtures/blogPosts.ts

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
  {
    id: 'test-post-1',
    title: 'Test Post 1',
    slug: 'test-post-1',
    excerpt: 'Test excerpt 1',
    content: createMockMDX('Test content 1'),
    publishedAt: '2024-01-14T12:00:00-08:00',
    author: {
      id: 'william-callahan',
      name: 'William Callahan'
    },
    tags: ['testing', 'development'],
    readingTime: 5
  },
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

/**
 * Blog Posts Test Fixtures
 */

export const BLOG_POSTS_TEST_FIXTURES = [
  {
    id: 'test-post-1',
    title: 'Test Post 1',
    description: 'A test blog post about testing',
    date: '2025-01-01',
    content: '# Test Post 1\n\nThis is a test blog post.',
    slug: 'test-post-1',
    tags: ['testing', 'development'],
    published: true
  },
  {
    id: 'test-post-2',
    title: 'Test Post 2',
    description: 'Another test blog post',
    date: '2025-01-02',
    content: '# Test Post 2\n\nThis is another test blog post.',
    slug: 'test-post-2',
    tags: ['testing'],
    published: true
  },
  {
    id: 'draft-post',
    title: 'Draft Post',
    description: 'A draft blog post',
    date: '2025-01-03',
    content: '# Draft Post\n\nThis is a draft post.',
    slug: 'draft-post',
    tags: ['draft'],
    published: false
  }
];

describe('Blog Posts Fixtures', () => {
  it('placeholder test - to be implemented', () => {
    // TODO: Implement blog posts fixture tests
    expect(true).toBe(true);
  });
});

describe('Blog Posts Fixtures', () => {
  it('provides valid test data', () => {
    expect(BLOG_POSTS_TEST_FIXTURES).toHaveLength(3);
    expect(BLOG_POSTS_TEST_FIXTURES[0]).toHaveProperty('slug', 'test-post-1');
    expect(BLOG_POSTS_TEST_FIXTURES[1]).toHaveProperty('slug', 'test-post-2');
    expect(BLOG_POSTS_TEST_FIXTURES[2]).toHaveProperty('slug', 'draft-post');
  });
});
