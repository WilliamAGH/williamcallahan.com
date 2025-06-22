/**
 * Sitemap Tests
 * @description Tests that the sitemap generates correctly with proper pagination and lastModified handling
 * @jest-environment node
 */

import sitemap from "@/app/sitemap";
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

// Mock dependencies
jest.mock("@/lib/bookmarks/bookmarks.server", () => ({
  getBookmarksForStaticBuild: jest.fn(),
}));

jest.mock("@/data/education", () => ({
  education: [],
  updatedAt: "2024-01-01",
}));

jest.mock("@/data/experience", () => ({
  experience: [],
  updatedAt: "2024-01-01",
}));

jest.mock("@/data/investments", () => ({
  investments: [],
  updatedAt: "2024-01-01",
}));

jest.mock("@/data/projects", () => ({
  projects: [],
  updatedAt: "2024-01-01",
}));

// Mock the blog posts loading
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readdirSync: jest.fn(() => ["test-post.mdx"]),
  readFileSync: jest.fn(
    () => `---
title: Test Post
publishedAt: '2024-01-01'
updatedAt: '2024-01-02'
---
Content`,
  ),
}));

describe("Sitemap Generation", () => {
  const mockGetBookmarksForStaticBuild = getBookmarksForStaticBuild;
  let originalSiteUrl: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  /**
   * @description Tests bookmark pagination in the sitemap
   */
  describe("Bookmarks Pagination Logic", () => {
    /**
     * @description Generates correct paginated entries based on BOOKMARKS_PER_PAGE
     */
    it("should create paginated entries based on BOOKMARKS_PER_PAGE", () => {
      // Mock 50 bookmarks to test pagination logic
      const mockBookmarks = Array.from({ length: 50 }, (_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example.com/${i}`,
        title: `Bookmark ${i}`,
        dateBookmarked: new Date("2024-01-01").toISOString(),
        tags: [],
      }));

      mockGetBookmarksForStaticBuild.mockReturnValue(mockBookmarks);

      const sitemapEntries = sitemap();

      // Calculate expected pages
      const totalPages = Math.ceil(mockBookmarks.length / BOOKMARKS_PER_PAGE);
      expect(totalPages).toBe(3); // 50 / 24 = 2.08, rounded up to 3

      // Find paginated bookmark entries (pages 2 and 3, since page 1 is /bookmarks)
      const paginatedEntries = sitemapEntries.filter((entry) => entry.url.includes("/bookmarks/page/"));

      // Should have entries for pages 2 and 3
      expect(paginatedEntries).toHaveLength(2);
      expect(paginatedEntries[0].url).toBe("https://williamcallahan.com/bookmarks/page/2");
      expect(paginatedEntries[1].url).toBe("https://williamcallahan.com/bookmarks/page/3");

      // All paginated entries should have proper metadata
      for (const entry of paginatedEntries) {
        expect(entry.changeFrequency).toBe("weekly");
        expect(entry.priority).toBe(0.65);
      }
    });

    /**
     * @description Handles undefined lastModified gracefully if no dateBookmarked
     */
    it("should handle undefined lastModified gracefully", () => {
      // Mock bookmarks without dates
      const mockBookmarks = Array.from({ length: 30 }, (_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example.com/${i}`,
        title: `Bookmark ${i}`,
        // No dateBookmarked - will result in undefined lastModified
        tags: [],
      }));

      mockGetBookmarksForStaticBuild.mockReturnValue(mockBookmarks);

      const sitemapEntries = sitemap();

      // Find paginated bookmark entry
      const paginatedEntry = sitemapEntries.find(
        (entry) => entry.url === "https://williamcallahan.com/bookmarks/page/2",
      );

      expect(paginatedEntry).toBeDefined();
      // lastModified should not be present when undefined
      expect(paginatedEntry?.lastModified).toBeUndefined();
    });

    /**
     * @description Includes lastModified with the most recent bookmark date
     */
    it("should include lastModified when bookmarks have dates", () => {
      const testDate = new Date("2024-06-15T10:00:00Z");

      // Mock bookmarks with dates
      const mockBookmarks = Array.from({ length: 30 }, (_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example.com/${i}`,
        title: `Bookmark ${i}`,
        dateBookmarked: testDate.toISOString(),
        tags: [],
      }));

      mockGetBookmarksForStaticBuild.mockReturnValue(mockBookmarks);

      const sitemapEntries = sitemap();

      // Find paginated bookmark entry
      const paginatedEntry = sitemapEntries.find(
        (entry) => entry.url === "https://williamcallahan.com/bookmarks/page/2",
      );

      expect(paginatedEntry).toBeDefined();
      expect(paginatedEntry?.lastModified).toEqual(testDate);
    });

    /**
     * @description Skips pagination if total bookmarks are less than a single page
     */
    it("should not create pagination for a single page of bookmarks", () => {
      // Mock only 20 bookmarks (less than BOOKMARKS_PER_PAGE)
      const mockBookmarks = Array.from({ length: 20 }, (_, i) => ({
        id: `bookmark-${i}`,
        url: `https://example.com/${i}`,
        title: `Bookmark ${i}`,
        dateBookmarked: new Date("2024-01-01").toISOString(),
        tags: [],
      }));

      mockGetBookmarksForStaticBuild.mockReturnValue(mockBookmarks);

      const sitemapEntries = sitemap();

      // Should not have any paginated entries
      const paginatedEntries = sitemapEntries.filter((entry) => entry.url.includes("/bookmarks/page/"));

      expect(paginatedEntries).toHaveLength(0);

      // But should still have the main bookmarks page
      const mainBookmarksEntry = sitemapEntries.find((entry) => entry.url === "https://williamcallahan.com/bookmarks");

      expect(mainBookmarksEntry).toBeDefined();
    });
  });

  /**
   * @description Tests sitemap entries for individual bookmarks
   */
  describe("Individual Bookmark Entries", () => {
    /**
     * @description Creates a unique sitemap entry for each bookmark with a slug
     */
    it("should create entries for individual bookmarks with slugs", () => {
      const mockBookmarks = [
        {
          id: "bookmark-1",
          url: "https://example.com/article",
          title: "Great Article",
          dateBookmarked: new Date("2024-01-01").toISOString(),
          tags: ["tech", "web"],
        },
        {
          id: "bookmark-2",
          url: "https://another.com/post",
          title: "Another Post",
          dateBookmarked: new Date("2024-01-02").toISOString(),
          tags: ["design"],
        },
      ];

      mockGetBookmarksForStaticBuild.mockReturnValue(mockBookmarks);

      const sitemapEntries = sitemap();

      // Should have entries for individual bookmarks
      const bookmarkEntries = sitemapEntries.filter(
        (entry) => entry.url.includes("/bookmarks/") && !entry.url.includes("/page/"),
      );

      // Should generate slugs based on domain and title
      expect(
        bookmarkEntries.some((entry) => entry.url.includes("/bookmarks/") && entry.url.includes("example-com")),
      ).toBe(true);

      expect(
        bookmarkEntries.some((entry) => entry.url.includes("/bookmarks/") && entry.url.includes("another-com")),
      ).toBe(true);
    });
  });

  /**
   * @description Tests inclusion of all static pages in the sitemap
   */
  describe("Static Page Entries", () => {
    /**
     * @description Includes all static pages with correct metadata
     */
    it("should include all static pages with correct metadata", () => {
      mockGetBookmarksForStaticBuild.mockReturnValue([]);

      const sitemapEntries = sitemap();

      // Check for main static pages
      const expectedPages = [
        "https://williamcallahan.com/",
        "https://williamcallahan.com/blog",
        "https://williamcallahan.com/projects",
        "https://williamcallahan.com/bookmarks",
        "https://williamcallahan.com/experience",
        "https://williamcallahan.com/education",
        "https://williamcallahan.com/investments",
      ];

      for (const expectedUrl of expectedPages) {
        const entry = sitemapEntries.find((e) => e.url === expectedUrl);
        expect(entry).toBeDefined();
        expect(entry?.changeFrequency).toBeDefined();
        expect(entry?.priority).toBeDefined();
      }
    });
  });
});
