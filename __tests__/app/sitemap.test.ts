/** @vitest-environment node */
import sitemap from "@/app/sitemap";
import { getAllPostsMeta } from "@/lib/blog";
import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  listCanonicalTagPageCounts,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { buildBookmarksIndex, SAMPLE_SLUG_MAPPING } from "@/test-utils/sitemap-factories";
import { getBookmarkSitemapRowsFromDatabase } from "@/lib/db/queries/bookmarks";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarksIndex: vi.fn<typeof getBookmarksIndex>(),
  getBookmarksPage: vi.fn<typeof getBookmarksPage>(),
  listBookmarkTagSlugs: vi.fn<typeof listBookmarkTagSlugs>(),
  listCanonicalTagPageCounts: vi.fn<typeof listCanonicalTagPageCounts>(),
}));
vi.mock("@/lib/bookmarks/slug-manager", () => ({
  loadSlugMapping: vi.fn<typeof loadSlugMapping>(),
}));
vi.mock("@/lib/db/queries/bookmarks", () => ({
  getBookmarkSitemapRowsFromDatabase: vi.fn<typeof getBookmarkSitemapRowsFromDatabase>(),
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

const mockBookmarkRows = vi.mocked(getBookmarkSitemapRowsFromDatabase);
const mockTagSlugs = vi.mocked(listBookmarkTagSlugs);
const mockTagPageCounts = vi.mocked(listCanonicalTagPageCounts);

describe("Sitemap Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBookmarkRows.mockReset();
    mockTagSlugs.mockReset();
    mockTagPageCounts.mockReset();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://williamcallahan.com");
    mockBookmarkRows.mockResolvedValue([]);
    vi.mocked(getBookmarksIndex).mockResolvedValue(
      buildBookmarksIndex({ count: 2, totalPages: 1, lastModified: "2026-10-25T00:00:00Z" }),
    );
    vi.mocked(getBookmarksPage).mockResolvedValue([]);
    vi.mocked(loadSlugMapping).mockResolvedValue(null);
    mockTagSlugs.mockResolvedValue([]);
    mockTagPageCounts.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  describe("Bookmarks Root Pagination Retirement", () => {
    it.each([1, BOOKMARKS_PER_PAGE + 6])(
      "keeps /bookmarks but never root pagination for %i members",
      async (count) => {
        mockBookmarkRows.mockResolvedValue(
          Array.from({ length: count }, (_, index) => ({
            slug: `bookmark-${index}`,
            modifiedAt: null,
            dateCreated: null,
            dateBookmarked: "2024-01-01T00:00:00Z",
          })),
        );
        const entries = await sitemap();
        expect(entries.some((entry) => entry.url === "https://williamcallahan.com/bookmarks")).toBe(
          true,
        );
        expect(entries.filter((entry) => entry.url.includes("/bookmarks/page/"))).toHaveLength(0);
      },
    );
  });

  describe("Individual Bookmark Entries", () => {
    it("keeps each bookmark's meaningful lastmod instead of a shared index rebuild date", async () => {
      vi.mocked(loadSlugMapping).mockResolvedValue(SAMPLE_SLUG_MAPPING);
      mockBookmarkRows.mockResolvedValue([
        {
          slug: "example-com-article",
          modifiedAt: "2025-09-19T00:00:00Z",
          dateCreated: null,
          dateBookmarked: "2025-01-01T00:00:00Z",
        },
        {
          slug: "another-com-post",
          modifiedAt: "2025-08-30T00:00:00Z",
          dateCreated: null,
          dateBookmarked: "2025-01-01T00:00:00Z",
        },
      ]);
      const entries = await sitemap();
      expect(
        entries.find((entry) => entry.url.endsWith(buildBookmarkPath("example-com-article")))
          ?.lastModified,
      ).toEqual(new Date("2025-09-19T00:00:00Z"));
      expect(
        entries.find((entry) => entry.url.endsWith(buildBookmarkPath("another-com-post")))
          ?.lastModified,
      ).toEqual(new Date("2025-08-30T00:00:00Z"));
    });

    it("uses creation/bookmark dates for missing modifications and omits unknown lastmod", async () => {
      mockBookmarkRows.mockResolvedValue([
        {
          slug: "created",
          modifiedAt: "invalid",
          dateCreated: "2025-02-01",
          dateBookmarked: "2025-01-01",
        },
        {
          slug: "bookmarked",
          modifiedAt: null,
          dateCreated: null,
          dateBookmarked: "2025-03-01T12:00:00Z",
        },
        { slug: "unknown", modifiedAt: null, dateCreated: null, dateBookmarked: "invalid" },
      ]);
      const entries = await sitemap();
      expect(entries.find((entry) => entry.url.endsWith("/created"))?.lastModified).toEqual(
        new Date("2025-02-01T23:59:59.999Z"),
      );
      expect(entries.find((entry) => entry.url.endsWith("/bookmarked"))?.lastModified).toEqual(
        new Date("2025-03-01T12:00:00Z"),
      );
      expect(entries.find((entry) => entry.url.endsWith("/unknown"))).toMatchObject({
        lastModified: undefined,
      });
    });

    it("includes detail entries during phase-production-build", async () => {
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      mockBookmarkRows.mockResolvedValue([
        {
          slug: "example-com-article",
          modifiedAt: null,
          dateCreated: null,
          dateBookmarked: "2024-01-01T00:00:00Z",
        },
      ]);
      const entries = await sitemap();
      expect(
        entries.some(
          (entry) =>
            entry.url === `https://williamcallahan.com${buildBookmarkPath("example-com-article")}`,
        ),
      ).toBe(true);
    });
  });

  describe("Tag Entries", () => {
    it("emits member-dated tag pagination regardless of tag count and omits empty tags", async () => {
      mockTagSlugs.mockResolvedValue(Array.from({ length: 250 }, (_, index) => `tag-${index}`));
      mockTagPageCounts.mockResolvedValue([
        { tagSlug: "tag-0", totalPages: 3, lastModified: "2024-02-01T00:00:00Z" },
      ]);
      const entries = await sitemap();
      for (const suffix of ["", "/page/2", "/page/3"]) {
        expect(
          entries.find(
            (entry) => entry.url === `https://williamcallahan.com/bookmarks/tags/tag-0${suffix}`,
          ),
        ).toMatchObject({ lastModified: new Date("2024-02-01T00:00:00Z") });
      }
      expect(entries.some((entry) => entry.url.endsWith("/tags/tag-249"))).toBe(false);
    });
  });

  describe("Project Entries", () => {
    it("lists canonical /projects/[slug] pages and no ?tag= query variants", async () => {
      const entries = await sitemap();
      const urls = entries.map((entry) => entry.url);
      expect(urls).toEqual(
        expect.arrayContaining([
          "https://williamcallahan.com/projects/aventure-vc",
          "https://williamcallahan.com/projects/researchly",
        ]),
      );
      expect(urls.filter((url) => url.includes("?tag="))).toHaveLength(0);
    });
  });

  describe("Static Page Entries", () => {
    it("includes static pages and frontmatter-canonical blog URLs with metadata", async () => {
      const entries = await sitemap();
      const posts = await getAllPostsMeta();
      const canonicalBlogUrls = posts.map(
        (post) => `https://williamcallahan.com/blog/${post.slug}`,
      );
      for (const route of [
        "",
        "/blog",
        "/projects",
        "/bookmarks",
        "/experience",
        "/education",
        "/investments",
      ]) {
        const entry = entries.find(
          (candidate) => candidate.url === `https://williamcallahan.com${route || "/"}`,
        );
        expect(entry).toBeDefined();
        expect(entry?.changeFrequency).toBeDefined();
        expect(entry?.priority).toBeDefined();
      }
      expect(entries.map((entry) => entry.url)).toEqual(expect.arrayContaining(canonicalBlogUrls));
    });
  });
});
