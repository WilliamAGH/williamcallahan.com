/** @vitest-environment node */
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

describe("Sitemap Generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://williamcallahan.com");
    vi.mocked(getBookmarksIndex).mockResolvedValue(
      buildBookmarksIndex({ count: 0, totalPages: 0, lastModified: "" }),
    );
    vi.mocked(getThoughtListItems).mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lists no bookmark detail, bookmark tag, blog tag or book page", async () => {
    vi.mocked(getBookmarksIndex).mockResolvedValue(
      buildBookmarksIndex({ count: 50, totalPages: 3, lastModified: "2024-01-01T00:00:00.000Z" }),
    );
    const posts = await getAllPostsMeta();
    expect(posts.some((post) => post.tags.length > 0)).toBe(true);
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls.filter((url) => /\/bookmarks\/.+/.test(url))).toEqual([]);
    expect(urls.filter((url) => url.includes("/blog/tags/"))).toEqual([]);
    expect(urls.filter((url) => /\/books\/.+/.test(url))).toEqual([]);
  });

  it("takes the /bookmarks lastModified from the bookmark index when it is newer", async () => {
    vi.mocked(getBookmarksIndex).mockResolvedValue(
      buildBookmarksIndex({ count: 5, totalPages: 1, lastModified: "2030-01-01T00:00:00.000Z" }),
    );
    const entries = await sitemap();
    expect(
      entries.find((entry) => entry.url === "https://williamcallahan.com/bookmarks")?.lastModified,
    ).toEqual(new Date("2030-01-01T00:00:00.000Z"));
  });

  it("omits the /thoughts listing while no thought is published", async () => {
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).not.toContain("https://williamcallahan.com/thoughts");
  });

  it("lists /thoughts and each published thought once one exists", async () => {
    vi.mocked(getThoughtListItems).mockResolvedValue([
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
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("https://williamcallahan.com/thoughts");
    expect(urls).toContain("https://williamcallahan.com/thoughts/first-thought");
    expect(urls).not.toContain("https://williamcallahan.com/thoughts/draft-thought");
  });

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

  it("includes static pages and frontmatter-canonical blog URLs with metadata", async () => {
    const entries = await sitemap();
    const posts = await getAllPostsMeta();
    for (const route of [
      "/",
      "/blog",
      "/projects",
      "/bookmarks",
      "/experience",
      "/education",
      "/investments",
    ]) {
      const entry = entries.find((item) => item.url === `https://williamcallahan.com${route}`);
      expect(entry).toBeDefined();
      expect(entry?.changeFrequency).toBeDefined();
      expect(entry?.priority).toBeDefined();
    }
    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining(posts.map((post) => `https://williamcallahan.com/blog/${post.slug}`)),
    );
  });
});
