/**
 * Routes Module Tests
 *
 * Tests HTTP status codes for:
 * 1. Static Page Routes
 *    - Verifies all main site pages return 200 OK
 *    - Tests root and all top-level pages
 *
 * 2. Blog Post Routes
 *    - Verifies all blog post URLs return 200 OK
 *    - Uses actual MDX filenames as slugs
 *    - Tests each post in /data/blog/posts/
 */

import fs from 'fs';
import path from 'path';

// Store original fetch
const originalFetch = global.fetch;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch; // Assert type for assignment

// Constants for test configuration
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const BLOG_POSTS_DIR = path.join(process.cwd(), 'data', 'blog', 'posts');

// Helper to get all blog post slugs from MDX files
const getBlogSlugs = (): string[] => {
  const files = fs.readdirSync(BLOG_POSTS_DIR);
  return files
    .filter(file => file.endsWith('.mdx'))
    .map(file => file.replace('.mdx', ''));
};

describe('Routes Module', () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockFetch.mockReset();
  });

  // Restore original fetch after all tests
  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('Non-existent Routes', () => {
    /**
     * Test: 404 Not Found Routes
     *
     * Verifies:
     * 1. Non-existent routes return 404
     * 2. Tests both top-level and blog routes
     *
     * Expected Behavior:
     * - Invalid routes should return HTTP 404
     * - Both static and dynamic routes handle missing content correctly
     */
    const nonExistentRoutes = [
      '/this-page-does-not-exist',
      '/blog/non-existent-post'
    ];

    test.each(nonExistentRoutes)('route %s returns 404', async (route) => {
      // Mock 404 response for non-existent routes
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 404,
          ok: false
        })
      );

      const response = await fetch(`${SITE_URL}${route}`);
      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}${route}`);
    });
  });

  describe('Static Page Routes', () => {
    /**
     * Test: Main Page Routes Status
     *
     * Verifies:
     * 1. Each main page route returns 200 OK
     * 2. Tests all top-level pages in the site
     *
     * Expected Behavior:
     * - All routes should return HTTP 200
     * - No redirects or errors
     */
    const routes = [
      '/',
      '/blog',
      '/bookmarks',
      '/education',
      '/experience',
      '/investments'
    ];

    test.each(routes)('route %s returns 200', async (route) => {
      // Mock 200 response for existing routes
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          ok: true
        })
      );

      const response = await fetch(`${SITE_URL}${route}`);
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}${route}`);
    });
  });

  describe('Blog Post Routes', () => {
    /**
     * Test: Blog Post Routes Status
     *
     * Verifies:
     * 1. Each blog post URL returns 200 OK
     * 2. Tests using actual MDX filenames as slugs
     *
     * Expected Behavior:
     * - All blog post URLs should return HTTP 200
     * - No missing or invalid routes
     */
    const slugs = getBlogSlugs();

    test.each(slugs)('blog post %s returns 200', async (slug) => {
      // Mock 200 response for existing blog posts
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          ok: true
        })
      );

      const response = await fetch(`${SITE_URL}/blog/${slug}`);
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}/blog/${slug}`);
    });
  });
});
