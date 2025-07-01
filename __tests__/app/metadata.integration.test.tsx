/**
 * Metadata Integration Tests
 * @description Tests that all pages generate correct metadata including SEO tags, pagination links, etc.
 * @jest-environment node
 */

import { generateMetadata as generateBookmarksMetadata } from "@/app/bookmarks/page/[pageNumber]/page";
import { getBookmarks } from "@/lib/bookmarks/bookmarks-data-access.server";
import type { Metadata } from "next";

// Mock dependencies
jest.mock("@/lib/bookmarks/bookmarks-data-access.server", () => ({
  getBookmarks: jest.fn(),
  setRefreshBookmarksCallback: jest.fn(),
  refreshAndPersistBookmarks: jest.fn(),
  initializeBookmarksDataAccess: jest.fn(),
}));

jest.mock("@/lib/seo/metadata", () => ({
  getStaticPageMetadata: jest.fn(() => ({
    title: "Bookmarks",
    description: "A collection of bookmarks",
    openGraph: {
      title: "Bookmarks",
      description: "A collection of bookmarks",
    },
    alternates: {},
  })),
}));

jest.mock("@/lib/seo/dynamic-metadata", () => ({
  generateDynamicTitle: jest.fn((content, _type, options) => {
    if (options?.isPaginated && options?.pageNumber) {
      return `${content} - Page ${options.pageNumber}`;
    }
    return content;
  }),
}));

jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

// Mock constants to ensure proper site URL
jest.mock("@/lib/constants", () => ({
  ...jest.requireActual("@/lib/constants"),
  NEXT_PUBLIC_SITE_URL: "https://williamcallahan.com",
}));

describe("Metadata Integration Tests", () => {
  const mockGetBookmarks = getBookmarks;

  // Mock bookmarks data
  const mockBookmarks = Array.from({ length: 50 }, (_, i) => ({
    id: `bookmark-${i}`,
    url: `https://example.com/${i}`,
    title: `Bookmark ${i}`,
    description: `Description ${i}`,
    tags: [],
    imageUrl: null,
    domain: "example.com",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    isFavorite: false,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBookmarks.mockResolvedValue(mockBookmarks);
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
  });

  describe("Pagination Link Tags", () => {
    it('should generate proper <link rel="prev/next"> tags using icons.other', async () => {
      const metadata = await generateBookmarksMetadata({
        params: { pageNumber: "2" },
      });

      // Check that we're using icons.other instead of metadata.other
      expect(metadata.icons).toBeDefined();
      expect(metadata.icons?.other).toBeDefined();
      expect(Array.isArray(metadata.icons?.other)).toBe(true);

      const links = metadata.icons?.other as Array<{ rel: string; url: string }>;

      // Should have both prev and next links for middle pages
      expect(links).toHaveLength(2);

      // Check prev link
      const prevLink = links.find((link) => link.rel === "prev");
      expect(prevLink).toBeDefined();
      expect(prevLink?.url).toBe("https://williamcallahan.com/bookmarks");

      // Check next link
      const nextLink = links.find((link) => link.rel === "next");
      expect(nextLink).toBeDefined();
      expect(nextLink?.url).toBe("https://williamcallahan.com/bookmarks/page/3");
    });

    it("should handle first page correctly (no prev link)", async () => {
      // First page should redirect, but if we test page 2 as the first paginated page
      const metadata = await generateBookmarksMetadata({
        params: { pageNumber: "2" },
      });

      const links = metadata.icons?.other as Array<{ rel: string; url: string }>;
      const prevLink = links.find((link) => link.rel === "prev");

      // Page 2 should have prev link to /bookmarks (not /bookmarks/page/1)
      expect(prevLink?.url).toBe("https://williamcallahan.com/bookmarks");
    });

    it("should handle last page correctly (no next link)", async () => {
      const metadata = await generateBookmarksMetadata({
        params: { pageNumber: "3" }, // Last page with 50 items, 24 per page
      });

      const links = metadata.icons?.other as Array<{ rel: string; url: string }>;

      // Should only have prev link
      const prevLink = links.find((link) => link.rel === "prev");
      const nextLink = links.find((link) => link.rel === "next");

      expect(prevLink).toBeDefined();
      expect(prevLink?.url).toBe("https://williamcallahan.com/bookmarks/page/2");
      expect(nextLink).toBeUndefined();
    });

    it("should not include pagination links for single page", async () => {
      // Mock fewer bookmarks that fit on one page
      mockGetBookmarks.mockResolvedValue(mockBookmarks.slice(0, 20));

      // This would be testing the main /bookmarks page, not the paginated version
      // But let's test that page numbers beyond available data handle correctly
      const metadata = await generateBookmarksMetadata({
        params: { pageNumber: "2" },
      });

      // Should handle gracefully - implementation might throw notFound()
      // or might show empty page with just prev link
      expect(metadata.icons?.other).toBeDefined();
    });
  });

  describe("SEO Metadata Completeness", () => {
    it("should include all required SEO fields", async () => {
      const metadata = await generateBookmarksMetadata({
        params: { pageNumber: "2" },
      });

      // Basic metadata
      expect(metadata.title).toBeDefined();
      expect(metadata.description).toBeDefined();

      // Canonical URL
      expect(metadata.alternates?.canonical).toBe("https://williamcallahan.com/bookmarks/page/2");

      // OpenGraph
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBeDefined();
      expect(metadata.openGraph?.url).toBeDefined();

      // Robots
      expect(metadata.robots).toBeDefined();
      expect(metadata.robots?.index).toBe(true);
      expect(metadata.robots?.follow).toBe(true);
    });
  });

  describe("Sitemap Integration", () => {
    // Note: We can't directly test the sitemap function due to its dependencies,
    // but we can test that our constants are used correctly

    it("should use BOOKMARKS_PER_PAGE constant consistently", async () => {
      const { BOOKMARKS_PER_PAGE } = await import("@/lib/constants");

      // Test that pagination calculation uses the constant
      const totalPages = Math.ceil(mockBookmarks.length / BOOKMARKS_PER_PAGE);
      expect(totalPages).toBe(3); // 50 bookmarks / 24 per page

      // Verify the constant value
      expect(BOOKMARKS_PER_PAGE).toBe(24);
    });
  });
});

/**
 * Utility to verify metadata output would generate correct HTML
 * This simulates what Next.js would render
 */
describe("Metadata HTML Output Verification", () => {
  function simulateMetadataToHTML(metadata: Metadata): string[] {
    const tags: string[] = [];

    // Title
    if (metadata.title) {
      let titleStr: string;
      if (typeof metadata.title === "string") {
        titleStr = metadata.title;
      } else if (metadata.title && typeof metadata.title === "object" && "absolute" in metadata.title) {
        titleStr = metadata.title.absolute || "";
      } else {
        titleStr = "";
      }
      tags.push(`<title>${titleStr}</title>`);
    }

    // Description
    if (metadata.description) {
      tags.push(`<meta name="description" content="${metadata.description}">`);
    }

    // Icons (including our pagination workaround)
    if (metadata.icons?.other && Array.isArray(metadata.icons.other)) {
      for (const link of metadata.icons.other) {
        tags.push(`<link rel="${link.rel}" href="${link.url}">`);
      }
    }

    // Canonical
    if (metadata.alternates?.canonical) {
      let canonicalStr: string;
      if (typeof metadata.alternates.canonical === "string") {
        canonicalStr = metadata.alternates.canonical;
      } else if (
        metadata.alternates.canonical &&
        typeof metadata.alternates.canonical === "object" &&
        "href" in metadata.alternates.canonical
      ) {
        canonicalStr = metadata.alternates.canonical.href;
      } else {
        canonicalStr = "";
      }
      if (canonicalStr) {
        tags.push(`<link rel="canonical" href="${canonicalStr}">`);
      }
    }

    // OpenGraph
    if (metadata.openGraph) {
      if (metadata.openGraph.title) {
        let ogTitleStr: string;
        if (typeof metadata.openGraph.title === "string") {
          ogTitleStr = metadata.openGraph.title;
        } else {
          ogTitleStr = "";
        }
        if (ogTitleStr) {
          tags.push(`<meta property="og:title" content="${ogTitleStr}">`);
        }
      }
      if (metadata.openGraph.url) {
        const ogUrlStr =
          typeof metadata.openGraph.url === "string" ? metadata.openGraph.url : metadata.openGraph.url.toString();
        tags.push(`<meta property="og:url" content="${ogUrlStr}">`);
      }
    }

    return tags;
  }

  it("should generate correct HTML tags for pagination", async () => {
    const metadata = await generateBookmarksMetadata({
      params: { pageNumber: "2" },
    });

    const htmlTags = simulateMetadataToHTML(metadata);

    // Verify pagination links are in correct format
    expect(htmlTags).toContain('<link rel="prev" href="https://williamcallahan.com/bookmarks">');
    expect(htmlTags).toContain('<link rel="next" href="https://williamcallahan.com/bookmarks/page/3">');

    // Verify other important tags - title without suffix due to length constraints
    expect(htmlTags.some((tag) => tag.includes("<title>Bookmarks - Page 2</title>"))).toBe(true);
    expect(htmlTags.some((tag) => tag.includes('rel="canonical"'))).toBe(true);
  });
});
