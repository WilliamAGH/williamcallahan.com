/**
 * Metadata Integration Tests
 * @description Verifies bookmarks root metadata and HTML tag rendering.
 * @vitest-environment node
 */

import type { Metadata } from "next";
import { generateMetadata as generateBookmarkDetailMetadata } from "@/app/bookmarks/[slug]/page";
import { generateMetadata as generateBookmarksMetadata } from "@/app/bookmarks/page";
import { getBookmarkById } from "@/lib/bookmarks/service.server";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { unifiedBookmarkSchema } from "@/types/schemas/bookmark";

const { mockGetBookmarkById, mockGetStaticPageMetadata, mockResolveBookmarkIdFromSlug } =
  vi.hoisted(() => ({
    mockGetBookmarkById: vi.fn(),
    mockResolveBookmarkIdFromSlug: vi.fn(),
    mockGetStaticPageMetadata: vi.fn(() => ({
      title: "Bookmarks",
      description: "A collection of bookmarks",
      openGraph: {
        title: "Bookmarks",
        description: "A collection of bookmarks",
        url: "https://williamcallahan.com/bookmarks",
      },
      alternates: {
        canonical: "https://williamcallahan.com/bookmarks",
      },
    })),
  }));

vi.mock("@/lib/bookmarks/service.server", () => ({
  getBookmarkById: mockGetBookmarkById,
}));

vi.mock("@/lib/bookmarks/slug-helpers", () => ({
  resolveBookmarkIdFromSlug: mockResolveBookmarkIdFromSlug,
}));

vi.mock("@/lib/seo/metadata", () => ({
  getStaticPageMetadata: mockGetStaticPageMetadata,
}));

const mockedGetBookmarkById = vi.mocked(getBookmarkById);
const mockedResolveBookmarkIdFromSlug = vi.mocked(resolveBookmarkIdFromSlug);

describe("Metadata Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
  });

  it("generates root bookmarks metadata without pagination links", () => {
    const metadata = generateBookmarksMetadata();

    expect(mockGetStaticPageMetadata).toHaveBeenCalledWith("/bookmarks", "bookmarks");
    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBeDefined();
    expect(metadata.alternates?.canonical).toBe("https://williamcallahan.com/bookmarks");
    expect(metadata.icons).toBeUndefined();
  });

  it("includes required SEO metadata fields for root bookmarks", () => {
    const metadata = generateBookmarksMetadata();

    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBeDefined();
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.url).toBe("https://williamcallahan.com/bookmarks");
  });

  it("generates URL-less bookmark metadata without logging a URL parsing error", async () => {
    const slug = "unknown-url";
    const bookmark = unifiedBookmarkSchema.parse({
      id: "url-less-bookmark",
      url: "about:blank",
      title: "URL-less Bookmark",
      description: "",
      slug,
      tags: [],
      dateBookmarked: "2026-07-13T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-13T00:00:00.000Z",
    });
    mockedResolveBookmarkIdFromSlug.mockResolvedValue(bookmark.id);
    mockedGetBookmarkById.mockResolvedValue(bookmark);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const metadata = await generateBookmarkDetailMetadata({ params: Promise.resolve({ slug }) });

      expect(metadata.description).toBe(
        "A bookmark from website that I've saved for future reference.",
      );
      const bookmarkPath = buildBookmarkPath(slug);
      expect(metadata.alternates?.canonical).toBe(`https://williamcallahan.com${bookmarkPath}`);
      expect(metadata.openGraph?.url).toBe(`https://williamcallahan.com${bookmarkPath}`);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  describe("Robots.txt Environment Detection", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("treats API_BASE_URL production as production even when NEXT_PUBLIC_SITE_URL differs", async () => {
      vi.stubEnv("NODE_ENV", "production");
      process.env.API_BASE_URL = "https://williamcallahan.com";
      process.env.NEXT_PUBLIC_SITE_URL = "https://dev.williamcallahan.com";

      const { default: robots } = await import("@/app/robots");
      const result = robots();

      expect(result.rules).toMatchObject({
        userAgent: "*",
        allow: expect.arrayContaining(["/"]),
      });
      expect(result.sitemap).toBe("https://williamcallahan.com/sitemap.xml");
    });
  });
});

function simulateMetadataToHTML(metadata: Metadata): string[] {
  const tags: string[] = [];

  if (metadata.title) {
    const titleStr =
      typeof metadata.title === "string"
        ? metadata.title
        : typeof metadata.title === "object" && "absolute" in metadata.title
          ? metadata.title.absolute || ""
          : "";
    tags.push(`<title>${titleStr}</title>`);
  }

  if (metadata.description) {
    tags.push(`<meta name="description" content="${metadata.description}">`);
  }

  if (metadata.alternates?.canonical) {
    const canonicalStr =
      typeof metadata.alternates.canonical === "string"
        ? metadata.alternates.canonical
        : typeof metadata.alternates.canonical === "object" &&
            "href" in metadata.alternates.canonical
          ? metadata.alternates.canonical.href
          : "";

    if (canonicalStr) {
      tags.push(`<link rel="canonical" href="${canonicalStr}">`);
    }
  }

  const iconsOther = (metadata.icons as { other?: Array<{ rel: string; url: string }> } | undefined)
    ?.other;
  if (iconsOther && Array.isArray(iconsOther)) {
    for (const link of iconsOther) {
      tags.push(`<link rel="${link.rel}" href="${link.url}">`);
    }
  }

  return tags;
}

describe("Metadata HTML Output Verification", () => {
  it("does not render prev/next link tags for root bookmarks", () => {
    const metadata = generateBookmarksMetadata();
    const htmlTags = simulateMetadataToHTML(metadata);

    expect(htmlTags.some((tag) => tag.includes('rel="prev"'))).toBe(false);
    expect(htmlTags.some((tag) => tag.includes('rel="next"'))).toBe(false);
    expect(htmlTags.some((tag) => tag.includes('rel="canonical"'))).toBe(true);
  });
});
