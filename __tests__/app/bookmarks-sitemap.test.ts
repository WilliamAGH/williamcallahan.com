import { GET } from "@/app/bookmarks-sitemap.xml/route";
import {
  listGraduatedBookmarkSitemapEntries,
  listGraduatedTagHubSitemapEntries,
} from "@/lib/db/queries/bookmark-seo";
import * as bookmarkCollectors from "@/lib/sitemap/bookmark-collectors";

vi.mock("@/lib/db/queries/bookmark-seo", () => ({
  listGraduatedBookmarkSitemapEntries: vi.fn<typeof listGraduatedBookmarkSitemapEntries>(),
  listGraduatedTagHubSitemapEntries: vi.fn<typeof listGraduatedTagHubSitemapEntries>(),
}));

// Exercise installed NextResponse status, headers, and body consumption.
vi.mock("next/server", async () => ({
  ...(await import("next/dist/server/web/spec-extension/response")),
}));

const SITE = "https://williamcallahan.com";
const MODIFIED = "2026-01-15T12:30:00.000Z";
const tagEntries = vi.mocked(listGraduatedTagHubSitemapEntries);
const bookmarkEntries = vi.mocked(listGraduatedBookmarkSitemapEntries);

describe("graduated bookmarks sitemap", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
    tagEntries
      .mockReset()
      .mockResolvedValue([{ tagSlug: "claude-code", bookmarkCount: 49, lastModified: MODIFIED }]);
    bookmarkEntries.mockReset().mockResolvedValue([{ slug: "agents-md", lastModified: MODIFIED }]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("collects canonical tag hubs and bookmark details with parsed content dates", async () => {
    const entries = await bookmarkCollectors.collectGraduatedBookmarksSitemapEntries(SITE);

    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: `${SITE}/bookmarks/tags/claude-code`,
          lastModified: new Date(MODIFIED),
          changeFrequency: "weekly",
        }),
        expect.objectContaining({
          url: `${SITE}/bookmarks/agents-md`,
          lastModified: new Date(MODIFIED),
          changeFrequency: "monthly",
        }),
      ]),
    );
    expect(entries.some((entry) => entry.url.includes("/page/"))).toBe(false);
  });

  it("returns a cacheable XML sitemap without indexing the sitemap document itself", async () => {
    const response = await GET();
    const xml = await response.text();
    const document = new DOMParser().parseFromString(xml, "application/xml");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml; charset=utf-8");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    );
    expect(xml).toMatch(/^<\?xml version="1\.0"/);
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.documentElement.localName).toBe("urlset");
    expect(document.documentElement.namespaceURI).toBe(
      "http://www.sitemaps.org/schemas/sitemap/0.9",
    );
    expect(
      Array.from(document.querySelectorAll("loc"), (node) => node.textContent).toSorted(),
    ).toEqual([`${SITE}/bookmarks/agents-md`, `${SITE}/bookmarks/tags/claude-code`]);
    expect(Array.from(document.querySelectorAll("lastmod"), (node) => node.textContent)).toEqual([
      MODIFIED,
      MODIFIED,
    ]);
    expect(
      Array.from(document.querySelectorAll("changefreq"), (node) => node.textContent).toSorted(),
    ).toEqual(["monthly", "weekly"]);
    const priorities = Array.from(document.querySelectorAll("priority"), (node) =>
      Number(node.textContent),
    );
    expect(priorities).toHaveLength(2);
    expect(priorities.every((priority) => priority >= 0 && priority <= 1)).toBe(true);
  });

  it("XML-escapes URL characters and preserves their decoded value", async () => {
    const url = `${SITE}/bookmarks/agents-md?view=notes&source=hub`;
    vi.spyOn(bookmarkCollectors, "collectGraduatedBookmarksSitemapEntries").mockResolvedValueOnce([
      { url, lastModified: new Date(MODIFIED), changeFrequency: "monthly", priority: 0.6 },
    ]);

    const response = await GET();
    const xml = await response.text();
    const document = new DOMParser().parseFromString(xml, "application/xml");

    expect(xml).toContain("view=notes&amp;source=hub");
    expect(document.querySelector("parsererror")).toBeNull();
    expect(document.querySelector("loc")?.textContent).toBe(url);
    expect(document.querySelector("lastmod")?.textContent).toBe(MODIFIED);
    expect(document.querySelector("changefreq")?.textContent).toBe("monthly");
    expect(document.querySelector("priority")?.textContent).toBe("0.6");
  });

  it.each(["tag hub", "bookmark"])("propagates a production %s query failure", async (source) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VITEST", "false");
    vi.stubEnv("TEST", "false");
    const outage = new Error("database outage");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    (source === "tag hub" ? tagEntries : bookmarkEntries).mockRejectedValueOnce(outage);

    await expect(bookmarkCollectors.collectGraduatedBookmarksSitemapEntries(SITE)).rejects.toBe(
      outage,
    );
    expect(errorLog.mock.calls.flat().join(" ")).toContain("database outage");
  });
});
