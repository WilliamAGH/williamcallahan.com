/**
 * Metadata Integration Tests
 * @description Verifies bookmarks root metadata and HTML tag rendering.
 * @vitest-environment node
 */

import type { Metadata } from "next";
import { generateMetadata as generateBookmarksMetadata } from "@/app/bookmarks/page";

const { mockGetStaticPageMetadata } = vi.hoisted(() => ({
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

vi.mock("@/lib/seo/metadata", () => ({
  getStaticPageMetadata: mockGetStaticPageMetadata,
}));

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

  describe("Robots.txt Environment Detection", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("treats API_BASE_URL production as production even when NEXT_PUBLIC_SITE_URL differs", async () => {
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
