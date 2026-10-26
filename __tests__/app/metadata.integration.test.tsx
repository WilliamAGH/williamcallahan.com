/**
 * Metadata Integration Tests
 * @description Verifies bookmarks root metadata and HTML tag rendering.
 * @vitest-environment node
 */

import type { Metadata } from "next";
import { generateMetadata as generateBookmarkDetailMetadata } from "@/app/bookmarks/[slug]/page";
import { generateMetadata as generateBookmarksMetadata } from "@/app/bookmarks/page";
import { generateMetadata as generateTagMetadata } from "@/app/bookmarks/tags/[...slug]/page";
import {
  getBookmarkById,
  getBookmarksIndex,
  getBookmarksByTag,
  resolveBookmarkTagSlug,
} from "@/lib/bookmarks/service.server";
import type { getBookmarkTopicHubEvidence } from "@/lib/db/queries/bookmark-seo";
import { generateMetadata as generateBlogTagMetadata } from "@/app/blog/tags/[tagSlug]/page";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { bookmarksIndexSchema, unifiedBookmarkSchema } from "@/types/schemas/bookmark";
import { bookmarkTopicHubEvidenceSchema } from "@/types/schemas/bookmark-seo";
import type { getStaticPageMetadata } from "@/lib/seo/metadata";

const {
  mockGetBookmarkById,
  mockGetBookmarksIndex,
  mockGetBookmarksByTag,
  mockResolveBookmarkTagSlug,
  mockGetBookmarkTopicHubEvidence,
  mockGetStaticPageMetadata,
  mockResolveBookmarkIdFromSlug,
} = vi.hoisted(() => ({
  mockGetBookmarkById: vi.fn<typeof getBookmarkById>(),
  mockGetBookmarksIndex: vi.fn<typeof getBookmarksIndex>(),
  mockGetBookmarksByTag: vi.fn<typeof getBookmarksByTag>(),
  mockResolveBookmarkTagSlug: vi.fn<typeof resolveBookmarkTagSlug>(),
  mockGetBookmarkTopicHubEvidence: vi.fn<typeof getBookmarkTopicHubEvidence>(),
  mockResolveBookmarkIdFromSlug: vi.fn<typeof resolveBookmarkIdFromSlug>(),
  mockGetStaticPageMetadata: vi.fn<typeof getStaticPageMetadata>(() => ({
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
  getBookmarksIndex: mockGetBookmarksIndex,
  getBookmarksByTag: mockGetBookmarksByTag,
  resolveBookmarkTagSlug: mockResolveBookmarkTagSlug,
}));

vi.mock("@/lib/db/queries/bookmark-seo", () => ({
  getBookmarkTopicHubEvidence: mockGetBookmarkTopicHubEvidence,
}));

vi.mock("@/lib/bookmarks/slug-helpers", () => ({
  resolveBookmarkIdFromSlug: mockResolveBookmarkIdFromSlug,
}));

vi.mock("@/lib/seo/metadata", () => ({
  getStaticPageMetadata: mockGetStaticPageMetadata,
}));

const mockedGetBookmarkById = vi.mocked(getBookmarkById);
const mockedResolveBookmarkIdFromSlug = vi.mocked(resolveBookmarkIdFromSlug);

const PUBLIC_HUB_THRESHOLD = 12;
const BELOW_PUBLIC_HUB_THRESHOLD = 11;
const qualifyingBookmark = unifiedBookmarkSchema.parse({
  id: "qualifying-bookmark",
  url: "https://example.com/agent-workflows",
  title: "Agent workflow comparison",
  description: "",
  slug: "agent-workflows",
  note: "We study this guide to compare agent workflows and verify changes before shipping reliable software.",
  summary:
    "The resource explains repository instructions, review checkpoints, and repeatable checks that help maintainers compare tools without losing the context needed to make an informed decision.",
  tags: [],
  dateBookmarked: "2026-07-13T00:00:00.000Z",
  sourceUpdatedAt: "2026-07-13T00:00:00.000Z",
});

describe("Metadata Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
  });

  it("generates root bookmarks metadata without pagination links", async () => {
    const metadata = await generateBookmarksMetadata({ searchParams: Promise.resolve({}) });

    expect(mockGetStaticPageMetadata).toHaveBeenCalledWith("/bookmarks", "bookmarks");
    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBeDefined();
    expect(metadata.alternates?.canonical).toBe("https://williamcallahan.com/bookmarks");
    expect(metadata.icons).toBeUndefined();
  });

  it("includes required SEO metadata fields for root bookmarks", async () => {
    const metadata = await generateBookmarksMetadata({ searchParams: Promise.resolve({}) });

    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBeDefined();
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph?.url).toBe("https://williamcallahan.com/bookmarks");
  });

  it("gives a valid latest-feed page its own canonical rather than consolidating it into the hub", async () => {
    mockGetBookmarksIndex.mockResolvedValue(
      bookmarksIndexSchema.parse({
        count: 66,
        totalPages: 3,
        pageSize: 24,
        lastModified: "2026-01-01T00:00:00Z",
        lastFetchedAt: 1,
        lastAttemptedAt: 1,
        checksum: "fixture",
      }),
    );
    const actual = await vi.importActual<typeof import("@/lib/seo/metadata")>("@/lib/seo/metadata");
    mockGetStaticPageMetadata.mockImplementationOnce(actual.getStaticPageMetadata);

    const metadata = await generateBookmarksMetadata({
      searchParams: Promise.resolve({ feed: "latest", page: "2" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "https://williamcallahan.com/bookmarks?feed=latest&page=2",
    );
    expect(metadata.openGraph?.url).toBe(metadata.alternates?.canonical);
    expect(metadata.title).toContain("Page 2");
  });

  it("does not advertise a canonical for a latest-feed page outside its real range", async () => {
    mockGetBookmarksIndex.mockResolvedValue(
      bookmarksIndexSchema.parse({
        count: 66,
        totalPages: 3,
        pageSize: 24,
        lastModified: "2026-01-01T00:00:00Z",
        lastFetchedAt: 1,
        lastAttemptedAt: 1,
        checksum: "fixture",
      }),
    );

    const metadata = await generateBookmarksMetadata({
      searchParams: Promise.resolve({ feed: "latest", page: "4" }),
    });

    expect(metadata.robots).toMatchObject({ index: false });
    expect(metadata.alternates?.canonical).toBeNull();
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

  it("keeps bookmark detail pages out of search indexes while their links stay crawlable", async () => {
    const slug = "example-com-article";
    const bookmark = unifiedBookmarkSchema.parse({
      id: "indexed-bookmark",
      url: "https://example.com/article",
      title: "Example Article",
      description: "An article saved from example.com",
      slug,
      tags: [],
      dateBookmarked: "2026-07-13T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-13T00:00:00.000Z",
    });
    mockedResolveBookmarkIdFromSlug.mockResolvedValue(bookmark.id);
    mockedGetBookmarkById.mockResolvedValue(bookmark);

    const metadata = await generateBookmarkDetailMetadata({ params: Promise.resolve({ slug }) });

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("keeps blog tag pages out of search indexes while their links stay crawlable", async () => {
    const metadata = await generateBlogTagMetadata({
      params: Promise.resolve({ tagSlug: "nextjs" }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
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
      expect(result.sitemap).toEqual([
        "https://williamcallahan.com/sitemap.xml",
        "https://williamcallahan.com/bookmarks-sitemap.xml",
      ]);
    });

    it("omits sitemap discovery and disallows all crawling outside production", async () => {
      vi.stubEnv("NODE_ENV", "development");
      process.env.NEXT_PUBLIC_SITE_URL = "https://dev.williamcallahan.com";
      process.env.API_BASE_URL = "https://dev.williamcallahan.com";

      const { default: robots } = await import("@/app/robots");
      const result = robots();

      expect(result.sitemap).toBeUndefined();
      expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    });
  });

  it("graduates practitioner-annotated bookmark metadata with note-led search copy", async () => {
    const note =
      "We study this guide to compare agent workflows and verify changes before shipping reliable software.";
    const bookmark = unifiedBookmarkSchema.parse({
      id: "annotated-bookmark",
      url: "https://example.com/agent-workflows",
      title: "Agent workflow comparison",
      description: "A practical comparison of agent workflows and review techniques.",
      slug: "agent-workflows",
      note,
      summary:
        "The resource explains repository instructions, review checkpoints, and repeatable checks that help maintainers compare tools without losing the context needed to make an informed decision.",
      tags: [],
      dateBookmarked: "2026-07-13T00:00:00.000Z",
      sourceUpdatedAt: "2026-07-13T00:00:00.000Z",
    });
    mockedResolveBookmarkIdFromSlug.mockResolvedValue(bookmark.id);
    mockedGetBookmarkById.mockResolvedValue(bookmark);

    const metadata = await generateBookmarkDetailMetadata({
      params: Promise.resolve({ slug: bookmark.slug }),
    });

    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.title).toContain("Field Notes");
    expect(metadata.description?.startsWith(note)).toBe(true);
    expect(metadata.description?.length).toBeLessThanOrEqual(160);
    expect(metadata.alternates?.canonical).toBe(
      "https://williamcallahan.com/bookmarks/agent-workflows",
    );
  });

  it.each([{ isPrivate: true }, { archived: true }])(
    "keeps qualifying excluded bookmark metadata out of search: %j",
    async (eligibility) => {
      const bookmark = unifiedBookmarkSchema.parse({ ...qualifyingBookmark, ...eligibility });
      mockedResolveBookmarkIdFromSlug.mockResolvedValue(bookmark.id);
      mockedGetBookmarkById.mockResolvedValue(bookmark);

      const metadata = await generateBookmarkDetailMetadata({
        params: Promise.resolve({ slug: bookmark.slug }),
      });

      expect(metadata.robots).toEqual({ index: false, follow: true });
    },
  );

  it("canonicalizes bookmark ID metadata to the slug without indexing the ID URL", async () => {
    mockedResolveBookmarkIdFromSlug.mockResolvedValue(qualifyingBookmark.id);
    mockedGetBookmarkById.mockResolvedValue(qualifyingBookmark);

    const metadata = await generateBookmarkDetailMetadata({
      params: Promise.resolve({ slug: qualifyingBookmark.id }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe(
      "https://williamcallahan.com/bookmarks/agent-workflows",
    );
    expect(metadata.openGraph?.url).toBe("https://williamcallahan.com/bookmarks/agent-workflows");
    expect(mockGetStaticPageMetadata).toHaveBeenCalledWith(
      "/bookmarks/agent-workflows",
      "bookmarks",
    );
  });

  it.each([
    { eligibleCount: BELOW_PUBLIC_HUB_THRESHOLD, indexable: false },
    { eligibleCount: PUBLIC_HUB_THRESHOLD, indexable: true },
    { eligibleCount: null, indexable: false },
  ])(
    "graduates tag metadata only with enough public, non-archived evidence: $eligibleCount",
    async ({ eligibleCount, indexable }) => {
      mockResolveBookmarkTagSlug.mockResolvedValue({
        requestedSlug: "agent-workflows",
        canonicalSlug: "agent-workflows",
        canonicalTagName: "Agent Workflows",
        isAlias: false,
      });
      mockGetBookmarksByTag.mockResolvedValue({
        bookmarks: [qualifyingBookmark],
        totalCount: PUBLIC_HUB_THRESHOLD,
        totalPages: 1,
        fromCache: true,
      });
      mockGetBookmarkTopicHubEvidence.mockResolvedValue(
        eligibleCount === null
          ? null
          : bookmarkTopicHubEvidenceSchema.parse({
              canonicalSlug: "agent-workflows",
              totalCount: eligibleCount,
              analyzedCount: 0,
              annotatedCount: 0,
              topDomains: [],
              topCategories: [],
              annotatedBookmarks: [],
              matrixResources: [],
            }),
      );

      const metadata = await generateTagMetadata({
        params: Promise.resolve({ slug: ["agent-workflows"] }),
      });

      expect(metadata.robots).toEqual({ index: indexable, follow: true });
      if (indexable) {
        expect(metadata.description).toContain(`${PUBLIC_HUB_THRESHOLD} curated`);
      }
    },
  );
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
  it("does not render prev/next link tags for root bookmarks", async () => {
    const metadata = await generateBookmarksMetadata({ searchParams: Promise.resolve({}) });
    const htmlTags = simulateMetadataToHTML(metadata);

    expect(htmlTags.some((tag) => tag.includes('rel="prev"'))).toBe(false);
    expect(htmlTags.some((tag) => tag.includes('rel="next"'))).toBe(false);
    expect(htmlTags.some((tag) => tag.includes('rel="canonical"'))).toBe(true);
  });
});
