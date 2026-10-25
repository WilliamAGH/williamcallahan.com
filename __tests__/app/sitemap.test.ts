/**
 * Sitemap Tests
 * @description Tests that the sitemap lists only search-indexable pages, with lastModified taken from each page's owner
 * @vitest-environment node
 */

import type { MockedFunction } from "vitest";
import sitemap from "@/app/sitemap";
import { getAllPostsMeta } from "@/lib/blog";
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { getThoughtListItems } from "@/lib/thoughts/service.server";
import { buildBookmarksIndex } from "@/test-utils/sitemap-factories";

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: vi.fn<typeof getBookmarksIndex>(),
}));

vi.mock("@/lib/thoughts/service.server", () => ({
  getThoughtListItems: vi.fn<typeof getThoughtListItems>(),
}));

vi.mock("@/data/education", () => ({ education: [], updatedAt: "2024-01-01" }));
vi.mock("@/data/experience", () => ({ experience: [], updatedAt: "2024-01-01" }));
vi.mock("@/data/investments", () => ({ investments: [], updatedAt: "2024-01-01" }));
vi.mock("@/data/projects", () => ({
  projects: [
    {
      id: "aventure",
      name: "aVenture.vc",
      description: "Venture capital research platform",
      shortSummary: "VC research",
      url: "https://aventure.vc",
      imageKey: "images/projects/aventure.png",
      tags: ["AI", "SaaS"],
    },
    {
      id: "researchly",
      name: "Researchly",
      description: "Research assistant",
      shortSummary: "Research",
      url: "https://researchly.dev",
      imageKey: "images/projects/researchly.png",
      tags: ["AI"],
    },
  ],
  updatedAt: "2024-01-01",
}));

const mockGetBookmarksIndex = getBookmarksIndex as MockedFunction<typeof getBookmarksIndex>;
const mockGetThoughtListItems = getThoughtListItems as MockedFunction<typeof getThoughtListItems>;

describe("Sitemap Generation", () => {
  let originalSiteUrl: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
    mockGetBookmarksIndex.mockResolvedValue(
      buildBookmarksIndex({ count: 0, totalPages: 0, lastModified: undefined }),
    );
    mockGetThoughtListItems.mockResolvedValue([]);
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  });

  describe("Search-excluded pages", () => {
    it("lists no bookmark detail, bookmark tag, blog tag or book page", async () => {
      mockGetBookmarksIndex.mockResolvedValue(
        buildBookmarksIndex({ count: 50, totalPages: 3, lastModified: "2024-01-01T00:00:00.000Z" }),
      );
      const posts = await getAllPostsMeta();
      // Tagged posts exist, so blog tag pages exist and could be listed.
      expect(posts.some((post) => post.tags.length > 0)).toBe(true);

      const urls = (await sitemap()).map((entry) => entry.url);

      expect(urls.filter((url) => /\/bookmarks\/.+/.test(url))).toEqual([]);
      expect(urls.filter((url) => url.includes("/blog/tags/"))).toEqual([]);
      expect(urls.filter((url) => /\/books\/.+/.test(url))).toEqual([]);
    });
  });

  describe("Bookmarks Listing", () => {
    it("takes the /bookmarks lastModified from the bookmark index when it is newer", async () => {
      mockGetBookmarksIndex.mockResolvedValue(
        buildBookmarksIndex({ count: 5, totalPages: 1, lastModified: "2030-01-01T00:00:00.000Z" }),
      );

      const entry = (await sitemap()).find(
        (sitemapEntry) => sitemapEntry.url === "https://williamcallahan.com/bookmarks",
      );

      expect(entry?.lastModified).toEqual(new Date("2030-01-01T00:00:00.000Z"));
    });
  });

  describe("Thought Entries", () => {
    it("omits the /thoughts listing while no thought is published", async () => {
      const urls = (await sitemap()).map((entry) => entry.url);

      expect(urls).not.toContain("https://williamcallahan.com/thoughts");
    });

    it("lists /thoughts and each published thought once one exists", async () => {
      mockGetThoughtListItems.mockResolvedValue([
        {
          id: "6f1c2a0e-3b5d-4c8e-9f7a-1d2e3f4a5b6c",
          slug: "first-thought",
          title: "First thought",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "7a2d3b1f-4c6e-4d9f-8a0b-2e3f4a5b6c7d",
          slug: "draft-thought",
          title: "Draft thought",
          createdAt: "2026-01-02T00:00:00.000Z",
          draft: true,
        },
      ]);

      const urls = (await sitemap()).map((entry) => entry.url);

      expect(urls).toContain("https://williamcallahan.com/thoughts");
      expect(urls).toContain("https://williamcallahan.com/thoughts/first-thought");
      expect(urls).not.toContain("https://williamcallahan.com/thoughts/draft-thought");
    });
  });

  describe("Project Entries", () => {
    it("lists canonical /projects/[slug] pages and no ?tag= query variants", async () => {
      const sitemapUrls = (await sitemap()).map((entry) => entry.url);

      expect(sitemapUrls).toEqual(
        expect.arrayContaining([
          "https://williamcallahan.com/projects/aventure-vc",
          "https://williamcallahan.com/projects/researchly",
        ]),
      );
      expect(sitemapUrls.filter((url) => url.includes("?tag="))).toHaveLength(0);
    });
  });

  describe("Static Page Entries", () => {
    it("includes static pages and frontmatter-canonical blog URLs with metadata", async () => {
      const sitemapEntries = await sitemap();
      const sitemapUrls = sitemapEntries.map((entry) => entry.url);
      const posts = await getAllPostsMeta();
      const canonicalBlogUrls = posts.map(
        (post) => `https://williamcallahan.com/blog/${post.slug}`,
      );
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

      expect(sitemapUrls).toEqual(expect.arrayContaining(canonicalBlogUrls));
    });
  });
});
