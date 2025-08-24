/**
 * Sitemap Generation Tests
 *
 * Tests for sitemap generation including bookmark tags with special characters
 */

import { tagToSlug } from "@/lib/utils/tag-utils";

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

      const slugs = similarTags.map(tag => tagToSlug(tag));

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
