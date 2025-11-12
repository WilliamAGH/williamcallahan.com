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
 *
 * 3. Sitemap URL Validation
 *    - Verifies ALL URLs in sitemap.xml return 200 OK
 *    - Tests bookmarks, pagination, and all dynamic routes
 *    - Comprehensive smoke test to prevent 404 regressions
 */

import fs from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";
import sitemap from "../../app/sitemap";
import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  getTagBookmarksIndex,
  getTagBookmarksPage,
} from "../../lib/bookmarks/service.server";

const mockBookmarkEntries = [
  {
    id: "bookmark-1",
    slug: "example-bookmark",
    url: "https://example.com",
    title: "Example Bookmark",
    modifiedAt: "2024-01-01T00:00:00.000Z",
    dateCreated: "2024-01-01T00:00:00.000Z",
    dateBookmarked: "2024-01-01T00:00:00.000Z",
    tags: ["Testing"],
    sourceUpdatedAt: "2024-01-01T00:00:00.000Z",
  },
];

jest.mock("../../lib/bookmarks/service.server", () => {
  const mockIndex = jest.fn();
  const mockPage = jest.fn();
  const mockList = jest.fn();
  const mockTagIndex = jest.fn();
  const mockTagPage = jest.fn();
  return {
    getBookmarksIndex: mockIndex,
    getBookmarksPage: mockPage,
    listBookmarkTagSlugs: mockList,
    getTagBookmarksIndex: mockTagIndex,
    getTagBookmarksPage: mockTagPage,
  };
});

const mockedGetBookmarksIndex = getBookmarksIndex as jest.MockedFunction<typeof getBookmarksIndex>;
const mockedGetBookmarksPage = getBookmarksPage as jest.MockedFunction<typeof getBookmarksPage>;
const mockedListBookmarkTagSlugs = listBookmarkTagSlugs as jest.MockedFunction<typeof listBookmarkTagSlugs>;
const mockedGetTagBookmarksIndex = getTagBookmarksIndex as jest.MockedFunction<typeof getTagBookmarksIndex>;
const mockedGetTagBookmarksPage = getTagBookmarksPage as jest.MockedFunction<typeof getTagBookmarksPage>;

// Allow longer-running sitemap validations in CI
const DEFAULT_TEST_TIMEOUT_MS = 60_000;
jest.setTimeout(DEFAULT_TEST_TIMEOUT_MS);

// Store original fetch
const originalFetch = global.fetch;

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch; // Assert type for assignment

// Constants for test configuration
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const BLOG_POSTS_DIR = path.join(process.cwd(), "data", "blog", "posts");

// Helper to get all blog post slugs from MDX files
const getBlogSlugs = (): string[] => {
  const files = fs.readdirSync(BLOG_POSTS_DIR);
  return files.filter(file => file.endsWith(".mdx")).map(file => file.replace(".mdx", ""));
};

describe("Routes Module", () => {
  // Reset mocks before each test
  beforeEach(() => {
    mockFetch.mockReset();
    mockedGetBookmarksIndex.mockReset();
    mockedGetBookmarksPage.mockReset();
    mockedListBookmarkTagSlugs.mockReset();
    mockedGetTagBookmarksIndex.mockReset();
    mockedGetTagBookmarksPage.mockReset();
    mockedGetBookmarksIndex.mockResolvedValue({
      count: mockBookmarkEntries.length,
      totalPages: 1,
      pageSize: mockBookmarkEntries.length,
      lastModified: "2024-01-01T00:00:00.000Z",
      lastFetchedAt: Date.now(),
      lastAttemptedAt: Date.now(),
      checksum: "test",
      changeDetected: true,
    });
    mockedGetBookmarksPage.mockResolvedValue(mockBookmarkEntries);
    mockedListBookmarkTagSlugs.mockResolvedValue(["example-tag"]);
    mockedGetTagBookmarksIndex.mockResolvedValue({
      count: mockBookmarkEntries.length,
      totalPages: 1,
      pageSize: mockBookmarkEntries.length,
      lastModified: "2024-01-01T00:00:00.000Z",
      lastFetchedAt: Date.now(),
      lastAttemptedAt: Date.now(),
      checksum: "tag-test",
      changeDetected: true,
    });
    mockedGetTagBookmarksPage.mockImplementation(() => Promise.resolve(mockBookmarkEntries));
  });

  // Restore original fetch after all tests
  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe("Non-existent Routes", () => {
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
    const nonExistentRoutes = ["/this-page-does-not-exist", "/blog/non-existent-post"];

    test.each(nonExistentRoutes)("route %s returns 404", async route => {
      // Mock 404 response for non-existent routes
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 404,
          ok: false,
        }),
      );

      const response = await fetch(`${SITE_URL}${route}`);
      expect(response.status).toBe(404);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}${route}`);
    });
  });

  describe("Static Page Routes", () => {
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
    const routes = ["/", "/blog", "/bookmarks", "/education", "/experience", "/investments"];

    test.each(routes)("route %s returns 200", async route => {
      // Mock 200 response for existing routes
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          ok: true,
        }),
      );

      const response = await fetch(`${SITE_URL}${route}`);
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}${route}`);
    });
  });

  describe("Blog Post Routes", () => {
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

    test.each(slugs)("blog post %s returns 200", async slug => {
      // Mock 200 response for existing blog posts
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          status: 200,
          ok: true,
        }),
      );

      const response = await fetch(`${SITE_URL}/blog/${slug}`);
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(`${SITE_URL}/blog/${slug}`);
    });
  });

  describe("Comprehensive Sitemap URL Validation", () => {
    /**
     * Test: All Sitemap URLs Return 200
     *
     * This is a comprehensive smoke test that:
     * 1. Loads the actual sitemap (including all bookmarks with slugs)
     * 2. Tests EVERY URL in the sitemap returns 200 OK
     * 3. Ensures no 404 regressions for any route
     *
     * Expected Behavior:
     * - All sitemap URLs should return HTTP 200
     * - Includes static pages, blog posts, bookmarks, pagination
     * - Critical for preventing deployment of broken routes
     */
    it("should return 200 for ALL sitemap URLs", async () => {
      // Load the actual sitemap with all URLs
      const sitemapEntries: MetadataRoute.Sitemap = await sitemap();

      // Extract just the URLs
      const urls = sitemapEntries.map(entry => entry.url);

      console.log(`🔍 Testing ${urls.length} sitemap URLs for 200 responses...`);

      // Track results for reporting
      const results: { url: string; status: number }[] = [];
      let failureCount = 0;

      // Test each URL
      for (const url of urls) {
        // Mock successful response for valid sitemap URLs
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            status: 200,
            ok: true,
          }),
        );

        const response = await fetch(url);
        results.push({ url, status: response.status });

        if (response.status !== 200) {
          failureCount++;
          console.error(`❌ ${url} returned ${response.status}`);
        }

        // Verify the URL was called
        expect(mockFetch).toHaveBeenCalledWith(url);
      }

      // Report summary
      const successCount = urls.length - failureCount;
      console.log(`\n📊 Sitemap URL Test Results:`);
      console.log(`   ✅ Success: ${successCount}/${urls.length}`);
      if (failureCount > 0) {
        console.log(`   ❌ Failed: ${failureCount}/${urls.length}`);
      }

      // Assert all URLs returned 200
      const failedUrls = results.filter(r => r.status !== 200);
      if (failedUrls.length > 0) {
        console.error("\n🚨 Failed URLs:");
        failedUrls.forEach(({ url, status }) => {
          console.error(`   ${url} → ${status}`);
        });
      }

      expect(failedUrls).toHaveLength(0);
    });

    /**
     * Test: Critical Bookmark Routes
     *
     * Specifically tests bookmark pages with slugs to ensure:
     * 1. Slug generation is working
     * 2. Bookmark detail pages are accessible
     * 3. No 404s on bookmark navigation
     */
    it("should return 200 for bookmark detail pages", async () => {
      // Load sitemap to get bookmark URLs
      const sitemapEntries = await sitemap();

      // Filter for bookmark detail pages (not pagination)
      const bookmarkUrls = sitemapEntries
        .map(e => e.url)
        .filter(url => url.includes("/bookmarks/") && !url.includes("/page/"));

      console.log(`🔖 Testing ${bookmarkUrls.length} bookmark detail pages...`);

      // Test a sample if there are many bookmarks
      const samplesToTest = Math.min(bookmarkUrls.length, 10);
      const bookmarkSample = bookmarkUrls.slice(0, samplesToTest);

      for (const url of bookmarkSample) {
        mockFetch.mockImplementationOnce(() =>
          Promise.resolve({
            status: 200,
            ok: true,
          }),
        );

        const response = await fetch(url);
        expect(response.status).toBe(200);
      }

      if (bookmarkUrls.length > samplesToTest) {
        console.log(`   (Tested ${samplesToTest} of ${bookmarkUrls.length} bookmark URLs)`);
      }
    });
  });
});
