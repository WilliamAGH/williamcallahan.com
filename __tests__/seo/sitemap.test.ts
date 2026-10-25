/**
 * Sitemap Generation Tests
 *
 * Tests for bookmark route and tag slug URL safety, and the bookmark-listing sitemap collector
 */

import type { MockedFunction } from "vitest";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { tagToSlug } from "@/lib/utils/tag-utils";
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { bookmarkDetailSlugSchema, bookmarkTagSchema } from "@/types/schemas/bookmark";
import { collectBookmarksLastModified } from "@/lib/sitemap/bookmark-collectors";

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: vi.fn<typeof getBookmarksIndex>(),
}));

const mockGetBookmarksIndex = getBookmarksIndex as MockedFunction<typeof getBookmarksIndex>;

describe("Sitemap URL Generation", () => {
  const siteUrl = "https://williamcallahan.com";

  describe("Bookmark Detail URLs", () => {
    it("accepts unreserved detail slugs and keeps tag slug validation independent", () => {
      expect(bookmarkDetailSlugSchema.safeParse("example.com~article_v2").success).toBe(true);
      expect(
        bookmarkTagSchema.safeParse({ id: "topic", name: "Topic", slug: "topic/segment" }).success,
      ).toBe(true);
    });

    it.each([".", "..", "nested/route", "with?query", "with#fragment"])(
      "rejects %j as a detail slug",
      (slug) => {
        expect(bookmarkDetailSlugSchema.safeParse(slug).success).toBe(false);
      },
    );

    it("encodes one bookmark detail route segment", () => {
      expect(buildBookmarkPath("nested/route?query#fragment")).toBe(
        "/bookmarks/nested%2Froute%3Fquery%23fragment",
      );
    });
  });

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
});

describe("Sitemap Collector Error Handling", () => {
  let originalVitest: string | undefined;
  let originalTest: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalVitest = process.env.VITEST;
    originalTest = process.env.TEST;
    vi.stubEnv("NODE_ENV", "test");
    process.env.VITEST = "true";
    process.env.TEST = "true";
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("throws in production when the bookmark index read fails", async () => {
    const outage = new Error("database outage");
    vi.stubEnv("NODE_ENV", "production");
    process.env.VITEST = "false";
    process.env.TEST = "false";
    mockGetBookmarksIndex.mockRejectedValue(outage);

    await expect(collectBookmarksLastModified()).rejects.toThrow("database outage");
  });

  it("returns no lastModified in tests when the bookmark index read fails", async () => {
    mockGetBookmarksIndex.mockRejectedValue(new Error("database outage"));

    await expect(collectBookmarksLastModified()).resolves.toBeUndefined();
  });
});
