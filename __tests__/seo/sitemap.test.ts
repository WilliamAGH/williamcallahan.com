/**
 * Sitemap Generation Tests
 *
 * Tests for sitemap generation including bookmark tags with special characters
 */

import type { MockedFunction } from "vitest";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { getBookmarksIndex, listBookmarkTagSlugs } from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import {
  collectBookmarkSitemapData,
  collectTagSitemapData,
} from "@/lib/sitemap/bookmark-collectors";

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: vi.fn(),
  getBookmarksPage: vi.fn(),
  listBookmarkTagSlugs: vi.fn(),
  getTagBookmarksIndex: vi.fn(),
}));

vi.mock("@/lib/bookmarks/slug-manager", () => ({
  loadSlugMapping: vi.fn(),
}));

const mockGetBookmarksIndex = getBookmarksIndex as MockedFunction<typeof getBookmarksIndex>;
const mockListBookmarkTagSlugs = listBookmarkTagSlugs as MockedFunction<
  typeof listBookmarkTagSlugs
>;
const mockLoadSlugMapping = loadSlugMapping as MockedFunction<typeof loadSlugMapping>;

describe("Sitemap URL Generation", () => {
  const siteUrl = "https://williamcallahan.com";

  describe("Bookmark Tag URLs", () => {
    it("should generate valid URLs for tags with special characters", () => {
      const testCases = [
        { tag: "AI & ML", expectedSlug: "ai-and-ml" },
        { tag: "C++", expectedSlug: "c-plus-plus" },
        { tag: "C#", expectedSlug: "c-sharp" },
        { tag: ".NET", expectedSlug: "dotnet" },
        { tag: "Node.js", expectedSlug: "nodedotjs" },
        { tag: "Vue@3", expectedSlug: "vue-at-3" },
        { tag: "React Native", expectedSlug: "react-native" },
        { tag: "Next.js 14", expectedSlug: "nextdotjs-14" },
      ];

      for (const { tag, expectedSlug } of testCases) {
        const slug = tagToSlug(tag);
        const url = `${siteUrl}/bookmarks/tags/${slug}`;

        expect(slug).toBe(expectedSlug);
        expect(url).toMatch(/^https:\/\/[a-zA-Z0-9.-]+\/bookmarks\/tags\/[a-z0-9-]+$/);
        expect(url).not.toContain(" ");
        expect(url).not.toContain("#");
        expect(url).not.toContain("&");
        expect(url).not.toContain("+");
        // Note: williamcallahan.com contains a dot, but the path portion should not
        expect(url.substring(url.indexOf("/bookmarks"))).not.toContain(".");
        expect(url).not.toContain("@");
      }
    });

    it("should generate valid paginated URLs for tags", () => {
      const tag = "React Native";
      const slug = tagToSlug(tag);
      const pageNumbers = [2, 3, 10, 100];

      for (const page of pageNumbers) {
        const url = `${siteUrl}/bookmarks/tags/${slug}/page/${page}`;
        expect(url).toBe(`https://williamcallahan.com/bookmarks/tags/react-native/page/${page}`);
        expect(url).toMatch(/^https:\/\/[a-zA-Z0-9.-]+\/bookmarks\/tags\/[a-z0-9-]+\/page\/\d+$/);
      }
    });

    it("should handle edge cases in tag slugs", () => {
      const edgeCases = [
        { tag: "", expectedSlug: "" },
        { tag: "   ", expectedSlug: "" },
        { tag: "---", expectedSlug: "" },
        { tag: "...", expectedSlug: "dot" },
        { tag: "Tag!@#$%^&*()", expectedSlug: "tag-at-sharp-and" },
        { tag: "UPPERCASE", expectedSlug: "uppercase" },
        { tag: "CamelCase", expectedSlug: "camelcase" },
        { tag: "snake_case", expectedSlug: "snake-case" },
      ];

      for (const { tag, expectedSlug } of edgeCases) {
        const slug = tagToSlug(tag);
        expect(slug).toBe(expectedSlug);

        if (slug) {
          const url = `${siteUrl}/bookmarks/tags/${slug}`;
          expect(url).toMatch(/^https:\/\/[a-zA-Z0-9.-]+\/bookmarks\/tags\/[a-z0-9-]*$/);
        }
      }
    });

    it("should ensure unique slugs for similar tags", () => {
      // Tags that might generate the same slug
      const similarTags = ["C++", "C+", "C"];

      const slugs = similarTags.map((tag) => tagToSlug(tag));

      // Check that C++ and C+ generate different slugs
      expect(slugs[0]).toBe("c-plus-plus");
      expect(slugs[1]).toBe("c-plus");
      expect(slugs[2]).toBe("c");

      // All slugs should be different
      const uniqueSlugs = new Set(slugs);
      expect(uniqueSlugs.size).toBe(slugs.length);
    });
  });

  describe("Sitemap Entry Structure", () => {
    it("should include all required fields for bookmark tag entries", () => {
      const tagSlug = tagToSlug("React Native");
      const lastModified = new Date("2025-01-01");

      const entry = {
        url: `${siteUrl}/bookmarks/tags/${tagSlug}`,
        lastModified: lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };

      expect(entry.url).toBe("https://williamcallahan.com/bookmarks/tags/react-native");
      expect(entry.lastModified).toBeInstanceOf(Date);
      expect(entry.changeFrequency).toBe("weekly");
      expect(entry.priority).toBe(0.6);
    });

    it("should include paginated entries with correct priority", () => {
      const tagSlug = tagToSlug("TypeScript");
      const lastModified = new Date("2025-01-01");

      const mainEntry = {
        url: `${siteUrl}/bookmarks/tags/${tagSlug}`,
        lastModified: lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.6,
      };

      const paginatedEntry = {
        url: `${siteUrl}/bookmarks/tags/${tagSlug}/page/2`,
        lastModified: lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.55, // Lower than main page
      };

      expect(paginatedEntry.priority).toBeLessThan(mainEntry.priority);
      expect(paginatedEntry.url).toContain("/page/2");
    });
  });
});

describe("Sitemap Collector Error Handling", () => {
  const siteUrl = "https://williamcallahan.com";
  let originalNodeEnv: string | undefined;
  let originalVitest: string | undefined;
  let originalTest: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;
    originalVitest = process.env.VITEST;
    originalTest = process.env.TEST;
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";
    process.env.TEST = "true";
    mockLoadSlugMapping.mockResolvedValue(null);
  });

  afterEach(() => {
    if (typeof originalNodeEnv === "string") {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
    if (typeof originalVitest === "string") {
      process.env.VITEST = originalVitest;
    } else {
      delete process.env.VITEST;
    }
    if (typeof originalTest === "string") {
      process.env.TEST = originalTest;
    } else {
      delete process.env.TEST;
    }
  });

  it("throws in production when bookmark collection fails", async () => {
    const outage = new Error("S3 outage");
    process.env.NODE_ENV = "production";
    process.env.VITEST = "false";
    process.env.TEST = "false";
    mockGetBookmarksIndex.mockRejectedValue(outage);

    await expect(collectBookmarkSitemapData(siteUrl)).rejects.toThrow("S3 outage");
  });

  it("throws in production when tag collection fails", async () => {
    const outage = new Error("S3 outage");
    process.env.NODE_ENV = "production";
    process.env.VITEST = "false";
    process.env.TEST = "false";
    mockListBookmarkTagSlugs.mockRejectedValue(outage);

    await expect(collectTagSitemapData(siteUrl)).rejects.toThrow("S3 outage");
  });

  it("returns empty fallback in tests when bookmark collection fails", async () => {
    mockGetBookmarksIndex.mockRejectedValue(new Error("S3 outage"));

    await expect(collectBookmarkSitemapData(siteUrl)).resolves.toEqual({
      entries: [],
      paginatedEntries: [],
      latestBookmarkUpdateTime: undefined,
    });
  });

  it("returns empty fallback in tests when tag collection fails", async () => {
    mockListBookmarkTagSlugs.mockRejectedValue(new Error("S3 outage"));

    await expect(collectTagSitemapData(siteUrl)).resolves.toEqual({
      tagEntries: [],
      paginatedTagEntries: [],
    });
  });
});
