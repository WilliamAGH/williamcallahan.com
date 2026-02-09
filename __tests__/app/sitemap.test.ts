/**
 * Sitemap Tests
 * @description Tests that the sitemap generates correctly with proper pagination and lastModified handling
 * @vitest-environment node
 */

import type { MockedFunction } from "vitest";
import sitemap from "@/app/sitemap";
import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  getTagBookmarksIndex,
  getTagBookmarksPage,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: vi.fn(),
  getBookmarksPage: vi.fn(),
  listBookmarkTagSlugs: vi.fn(),
  getTagBookmarksIndex: vi.fn(),
  getTagBookmarksPage: vi.fn(),
}));

vi.mock("@/lib/bookmarks/slug-manager", () => ({
  loadSlugMapping: vi.fn(),
}));

vi.mock("@/data/education", () => ({
  education: [],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/experience", () => ({
  experience: [],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/investments", () => ({
  investments: [],
  updatedAt: "2024-01-01",
}));

vi.mock("@/data/projects", () => ({
  projects: [],
  updatedAt: "2024-01-01",
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    readdirSync: vi.fn(() => ["test-post.mdx"]),
    readFileSync: vi.fn(
      () => `---
title: Test Post
publishedAt: '2024-01-01'
updatedAt: '2024-01-02'
---
Content`,
    ),
  };
});

const mockGetBookmarksIndex = getBookmarksIndex as MockedFunction<typeof getBookmarksIndex>;
const mockGetBookmarksPage = getBookmarksPage as MockedFunction<typeof getBookmarksPage>;
const mockListBookmarkTagSlugs = listBookmarkTagSlugs as MockedFunction<
  typeof listBookmarkTagSlugs
>;
const mockGetTagBookmarksIndex = getTagBookmarksIndex as MockedFunction<
  typeof getTagBookmarksIndex
>;
const mockGetTagBookmarksPage = getTagBookmarksPage as MockedFunction<typeof getTagBookmarksPage>;
const mockLoadSlugMapping = loadSlugMapping as MockedFunction<typeof loadSlugMapping>;

const buildBookmark = (
  id: string,
  overrides: Partial<{
    slug: string;
    url: string;
    title: string;
    dateBookmarked?: string;
    modifiedAt?: string;
    dateCreated?: string;
    tags: string[];
  }> = {},
) => ({
  id,
  slug: overrides.slug ?? `bookmark-${id}`,
  url: overrides.url ?? `https://example.com/${id}`,
  title: overrides.title ?? `Bookmark ${id}`,
  dateBookmarked: overrides.dateBookmarked,
  modifiedAt: overrides.modifiedAt,
  dateCreated: overrides.dateCreated,
  tags: overrides.tags ?? [],
});

describe("Sitemap Generation", () => {
  let originalSiteUrl: string | undefined;
  let originalNextPhase: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBookmarksIndex.mockReset();
    mockGetBookmarksPage.mockReset();
    mockListBookmarkTagSlugs.mockReset();
    mockGetTagBookmarksIndex.mockReset();
    mockGetTagBookmarksPage.mockReset();
    mockLoadSlugMapping.mockReset();
    originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    originalNextPhase = process.env.NEXT_PHASE;
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
    delete process.env.NEXT_PHASE;
    mockListBookmarkTagSlugs.mockResolvedValue([]);
    mockGetTagBookmarksIndex.mockResolvedValue(null);
    mockGetTagBookmarksPage.mockResolvedValue([]);
    mockLoadSlugMapping.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    if (typeof originalNextPhase === "string") {
      process.env.NEXT_PHASE = originalNextPhase;
    } else {
      delete process.env.NEXT_PHASE;
    }
  });

  describe("Bookmarks Pagination Logic", () => {
    it("creates paginated entries based on BOOKMARKS_PER_PAGE", async () => {
      const totalBookmarks = 50;
      const totalPages = Math.ceil(totalBookmarks / BOOKMARKS_PER_PAGE);

      mockGetBookmarksIndex.mockResolvedValue({
        count: totalBookmarks,
        totalPages,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-01-01T00:00:00.000Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      const pageData = new Map<number, ReturnType<typeof buildBookmark>[]>();
      for (let page = 1; page <= totalPages; page++) {
        const start = (page - 1) * BOOKMARKS_PER_PAGE;
        const end = Math.min(start + BOOKMARKS_PER_PAGE, totalBookmarks);
        const bookmarks: ReturnType<typeof buildBookmark>[] = [];
        for (let i = start; i < end; i++) {
          bookmarks.push(
            buildBookmark(String(i), {
              slug: `bookmark-${i}`,
              dateBookmarked: new Date("2024-01-01T00:00:00Z").toISOString(),
            }),
          );
        }
        pageData.set(page, bookmarks);
      }

      mockGetBookmarksPage.mockImplementation((pageNumber) =>
        Promise.resolve(pageData.get(pageNumber) ?? []),
      );

      const sitemapEntries = await sitemap();

      const paginatedEntries = sitemapEntries.filter((entry) =>
        entry.url.includes("/bookmarks/page/"),
      );
      expect(paginatedEntries).toHaveLength(totalPages - 1);
      expect(paginatedEntries.map((entry) => entry.url)).toEqual(
        expect.arrayContaining(
          Array.from(
            { length: totalPages - 1 },
            (_, idx) => `https://williamcallahan.com/bookmarks/page/${idx + 2}`,
          ),
        ),
      );
      for (const entry of paginatedEntries) {
        expect(entry.changeFrequency).toBe("weekly");
        expect(entry.priority).toBe(0.65);
      }
    });

    it("handles undefined lastModified gracefully", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: BOOKMARKS_PER_PAGE + 6,
        totalPages: 2,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: undefined,
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockImplementation((pageNumber) => {
        if (pageNumber === 1) {
          return Promise.resolve(
            Array.from({ length: BOOKMARKS_PER_PAGE }, (_, idx) =>
              buildBookmark(`page1-${idx}`, { slug: `page1-${idx}` }),
            ),
          );
        }
        return Promise.resolve(
          Array.from({ length: 6 }, (_, idx) =>
            buildBookmark(`page2-${idx}`, { slug: `page2-${idx}` }),
          ),
        );
      });

      const sitemapEntries = await sitemap();
      const paginatedEntry = sitemapEntries.find(
        (entry) => entry.url === "https://williamcallahan.com/bookmarks/page/2",
      );

      expect(paginatedEntry).toBeDefined();
      expect(paginatedEntry?.lastModified).toBeUndefined();
    });

    it("includes lastModified when bookmarks provide stable timestamps", async () => {
      const lastModified = new Date("2024-06-15T10:00:00Z").toISOString();

      mockGetBookmarksIndex.mockResolvedValue({
        count: BOOKMARKS_PER_PAGE + 2,
        totalPages: 2,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified,
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockImplementation((pageNumber) => {
        if (pageNumber === 1) {
          return Promise.resolve(
            Array.from({ length: BOOKMARKS_PER_PAGE }, (_, idx) =>
              buildBookmark(`page1-${idx}`, {
                slug: `page1-${idx}`,
                modifiedAt: lastModified,
              }),
            ),
          );
        }
        return Promise.resolve(
          Array.from({ length: 2 }, (_, idx) =>
            buildBookmark(`page2-${idx}`, {
              slug: `page2-${idx}`,
              modifiedAt: lastModified,
            }),
          ),
        );
      });

      const sitemapEntries = await sitemap();
      const paginatedEntry = sitemapEntries.find(
        (entry) => entry.url === "https://williamcallahan.com/bookmarks/page/2",
      );

      expect(paginatedEntry).toBeDefined();
      expect(paginatedEntry?.lastModified).toEqual(new Date(lastModified));
    });

    it("skips pagination when there is only one page of bookmarks", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: BOOKMARKS_PER_PAGE - 1,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: undefined,
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockResolvedValue(
        Array.from({ length: BOOKMARKS_PER_PAGE - 1 }, (_, idx) =>
          buildBookmark(`bookmark-${idx}`, { slug: `bookmark-${idx}` }),
        ),
      );

      const sitemapEntries = await sitemap();
      const paginatedEntries = sitemapEntries.filter((entry) =>
        entry.url.includes("/bookmarks/page/"),
      );
      expect(paginatedEntries).toHaveLength(0);

      const mainBookmarksEntry = sitemapEntries.find(
        (entry) => entry.url === "https://williamcallahan.com/bookmarks",
      );
      expect(mainBookmarksEntry).toBeDefined();
    });
  });

  describe("Individual Bookmark Entries", () => {
    it("uses slug mapping when available without fetching every bookmarks page", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: 2,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-01-02T00:00:00Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockLoadSlugMapping.mockResolvedValue({
        version: "1",
        generated: "2024-01-02T00:00:00.000Z",
        count: 2,
        checksum: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        slugs: {
          "bookmark-1": {
            id: "bookmark-1",
            slug: "example-com-article",
            url: "https://example.com/article",
            title: "Great Article",
          },
          "bookmark-2": {
            id: "bookmark-2",
            slug: "another-com-post",
            url: "https://another.com/post",
            title: "Another Post",
          },
        },
        reverseMap: {
          "example-com-article": "bookmark-1",
          "another-com-post": "bookmark-2",
        },
      });

      const sitemapEntries = await sitemap();

      expect(
        sitemapEntries.some(
          (entry) => entry.url === "https://williamcallahan.com/bookmarks/example-com-article",
        ),
      ).toBe(true);
      expect(
        sitemapEntries.some(
          (entry) => entry.url === "https://williamcallahan.com/bookmarks/another-com-post",
        ),
      ).toBe(true);
      expect(mockGetBookmarksPage).not.toHaveBeenCalled();
    });

    it("creates entries for each bookmark slug", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: 2,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-01-02T00:00:00Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockResolvedValue([
        buildBookmark("bookmark-1", {
          slug: "example-com-article",
          url: "https://example.com/article",
          title: "Great Article",
          dateBookmarked: "2024-01-01T00:00:00Z",
          tags: ["tech", "web"],
        }),
        buildBookmark("bookmark-2", {
          slug: "another-com-post",
          url: "https://another.com/post",
          title: "Another Post",
          dateBookmarked: "2024-01-02T00:00:00Z",
          tags: ["design"],
        }),
      ]);

      const sitemapEntries = await sitemap();
      const bookmarkEntries = sitemapEntries.filter(
        (entry) => entry.url.includes("/bookmarks/") && !entry.url.includes("/page/"),
      );

      expect(
        bookmarkEntries.some(
          (entry) => entry.url === "https://williamcallahan.com/bookmarks/example-com-article",
        ),
      ).toBe(true);
      expect(
        bookmarkEntries.some(
          (entry) => entry.url === "https://williamcallahan.com/bookmarks/another-com-post",
        ),
      ).toBe(true);
    });

    it("includes bookmark entries even when NEXT_PHASE is phase-production-build", async () => {
      process.env.NEXT_PHASE = "phase-production-build";

      mockGetBookmarksIndex.mockResolvedValue({
        count: 1,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-01-02T00:00:00Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockResolvedValue([
        buildBookmark("bookmark-1", {
          slug: "example-com-article",
          url: "https://example.com/article",
          title: "Great Article",
          dateBookmarked: "2024-01-01T00:00:00Z",
          tags: ["tech"],
        }),
      ]);

      const sitemapEntries = await sitemap();

      expect(
        sitemapEntries.some(
          (entry) => entry.url === "https://williamcallahan.com/bookmarks/example-com-article",
        ),
      ).toBe(true);
      expect(mockGetBookmarksPage).toHaveBeenCalledWith(1);
    });
  });

  describe("Tag Entries", () => {
    it("creates tag sitemap entries by streaming tag pages", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: BOOKMARKS_PER_PAGE,
        totalPages: 1,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-01-01T00:00:00Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "bookmark",
        changeDetected: true,
      });

      mockGetBookmarksPage.mockResolvedValue(
        Array.from({ length: BOOKMARKS_PER_PAGE }, (_, idx) =>
          buildBookmark(`bookmark-${idx}`, {
            slug: `bookmark-${idx}`,
            dateBookmarked: "2024-01-01T00:00:00Z",
          }),
        ),
      );

      mockListBookmarkTagSlugs.mockResolvedValue(["example-tag"]);
      mockGetTagBookmarksIndex.mockResolvedValue({
        count: BOOKMARKS_PER_PAGE + 5,
        totalPages: 2,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: "2024-02-01T00:00:00Z",
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "tag",
        changeDetected: true,
      });

      const sitemapEntries = await sitemap();

      expect(sitemapEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: "https://williamcallahan.com/bookmarks/tags/example-tag",
          }),
          expect.objectContaining({
            url: "https://williamcallahan.com/bookmarks/tags/example-tag/page/2",
          }),
        ]),
      );

      expect(mockGetTagBookmarksPage).not.toHaveBeenCalled();
    });
  });

  describe("Static Page Entries", () => {
    it("includes all static pages with metadata", async () => {
      mockGetBookmarksIndex.mockResolvedValue({
        count: 0,
        totalPages: 0,
        pageSize: BOOKMARKS_PER_PAGE,
        lastModified: undefined,
        lastFetchedAt: Date.now(),
        lastAttemptedAt: Date.now(),
        checksum: "test",
        changeDetected: false,
      });

      const sitemapEntries = await sitemap();
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
