/**
 * @vitest-environment node
 *
 * Regression tests for content hydration image resolution.
 * Validates that hydrateBookmarks uses selectBestImage (not raw ogImage)
 * and that hydrateBlogPosts uses canonical CDN resolution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { and, eq, inArray } from "drizzle-orm";
import type { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import type {
  buildCdnUrl,
  getBlogPostImageCdnUrl,
  getCdnConfigFromEnv,
  isOurCdnUrl,
} from "@/lib/utils/cdn-utils";
import type { resolveImageUrl } from "@/lib/seo/url-utils";
import type { resolveInvestmentLogo } from "@/lib/db/queries/investment-logo-resolver";

type HydrationDbRow = Record<string, unknown>;
type WhereStep = () => Promise<HydrationDbRow[]>;
type FromStep = () => { where: WhereStep };
type SelectStep = () => { from: FromStep };

// Hoist mocks so factory closures can reference them before module initialization
const { mockDbRows, mockDbSelect, mockSelectBestImage } = vi.hoisted(() => {
  const hoistedDbRows: HydrationDbRow[] = [];
  const hoistedDbSelect = vi.fn<SelectStep>(() => ({
    from: vi.fn<FromStep>(() => ({
      where: vi.fn<WhereStep>(() => Promise.resolve(hoistedDbRows)),
    })),
  }));
  return {
    mockDbRows: hoistedDbRows,
    mockDbSelect: hoistedDbSelect,
    mockSelectBestImage: vi.fn<typeof selectBestImage>(),
  };
});

vi.mock("@/lib/db/connection", () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock("@/lib/utils/cdn-utils", () => ({
  getCdnConfigFromEnv: vi.fn<typeof getCdnConfigFromEnv>(() => ({
    cdnBaseUrl: "https://s3-storage.callahan.cloud",
    s3BucketName: undefined,
    s3ServerUrl: undefined,
  })),
  isOurCdnUrl: vi.fn<typeof isOurCdnUrl>((url: string) =>
    url.startsWith("https://s3-storage.callahan.cloud"),
  ),
  buildCdnUrl: vi.fn<typeof buildCdnUrl>(
    (key: string) => `https://s3-storage.callahan.cloud/${key}`,
  ),
  getBlogPostImageCdnUrl: vi.fn<typeof getBlogPostImageCdnUrl>(),
}));

vi.mock("@/lib/bookmarks/bookmark-helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bookmarks/bookmark-helpers")>()),
  selectBestImage: mockSelectBestImage,
}));

vi.mock("@/lib/seo/url-utils", () => ({
  resolveImageUrl: vi.fn<typeof resolveImageUrl>((url?: string) => url),
}));

vi.mock("@/lib/db/queries/investment-logo-resolver", () => ({
  resolveInvestmentLogo: vi
    .fn<typeof resolveInvestmentLogo>()
    .mockResolvedValue("/images/placeholder.png"),
}));

// Schema mocks — Drizzle needs these for query building
vi.mock("@/lib/db/schema/bookmarks", () => ({
  bookmarks: {
    id: "id",
    title: "title",
    slug: "slug",
    url: "url",
    description: "description",
    tags: "tags",
    domain: "domain",
    ogImage: "og_image",
    content: "content",
    dateBookmarked: "date_bookmarked",
  },
}));
vi.mock("@/lib/db/schema/blog-posts", () => ({
  blogPosts: {
    id: "id",
    title: "title",
    slug: "slug",
    excerpt: "excerpt",
    authorName: "author_name",
    tags: "tags",
    publishedAt: "published_at",
    coverImage: "cover_image",
    draft: "draft",
  },
}));
vi.mock("@/lib/db/schema/investments", () => ({ investments: {} }));
vi.mock("@/lib/db/schema/books-individual", () => ({ booksIndividual: {} }));
vi.mock("@/lib/db/schema/thoughts", () => ({ thoughts: {} }));
vi.mock("drizzle-orm", () => ({
  inArray: vi.fn<typeof inArray>(),
  eq: vi.fn<typeof eq>(),
  and: vi.fn<typeof and>(),
}));

import { hydrateRelatedContent } from "@/lib/db/queries/content-hydration";

describe("hydrateBookmarks image resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbRows.length = 0;
  });

  it("calls selectBestImage with CDN-trusted ogImage and content for bookmark candidates", async () => {
    const cdnOgImage = "https://s3-storage.callahan.cloud/og/test.jpg";
    mockDbRows.push({
      id: "bm-1",
      title: "Test Bookmark",
      slug: "test-bookmark",
      url: "https://example.com",
      description: "A test",
      tags: [],
      domain: "example.com",
      ogImage: cdnOgImage,
      content: { screenshotAssetId: "screenshot-123" },
      dateBookmarked: "2024-01-01",
    });
    mockSelectBestImage.mockReturnValue(cdnOgImage);

    await hydrateRelatedContent([
      {
        domain: "bookmark",
        entityId: "bm-1",
        title: "Test",
        similarity: 0.9,
        contentDate: null,
        score: 0.9,
      },
    ]);

    expect(mockSelectBestImage).toHaveBeenCalledTimes(1);
    expect(mockSelectBestImage).toHaveBeenCalledWith(
      expect.objectContaining({
        ogImage: cdnOgImage,
        content: { screenshotAssetId: "screenshot-123" },
        id: "bm-1",
        url: "https://example.com",
      }),
      { includeImageAssets: false, includeScreenshots: true, preferScreenshots: true },
    );
  });

  it("passes undefined ogImage to selectBestImage when ogImage is external (not CDN)", async () => {
    mockDbRows.push({
      id: "bm-2",
      title: "External OG",
      slug: "external-og",
      url: "https://example.com",
      description: "Has external OG",
      tags: [],
      domain: "example.com",
      ogImage: "https://external.site/og.jpg",
      content: { screenshotAssetId: "screenshot-456" },
      dateBookmarked: "2024-01-01",
    });
    mockSelectBestImage.mockReturnValue("/api/assets/screenshot-456");

    await hydrateRelatedContent([
      {
        domain: "bookmark",
        entityId: "bm-2",
        title: "Test",
        similarity: 0.8,
        contentDate: null,
        score: 0.8,
      },
    ]);

    expect(mockSelectBestImage).toHaveBeenCalledWith(
      expect.objectContaining({
        ogImage: undefined,
        content: { screenshotAssetId: "screenshot-456" },
      }),
      expect.any(Object),
    );
  });

  it("hydrates project candidates from canonical data/projects.ts without querying PostgreSQL", async () => {
    const hydrated = await hydrateRelatedContent([
      {
        domain: "project",
        entityId: "Researchly",
        title: "Researchly",
        similarity: 0.91,
        contentDate: null,
        score: 0.91,
      },
    ]);

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(hydrated).toEqual([
      expect.objectContaining({
        type: "project",
        id: "Researchly",
        title: "Researchly",
        url: "/projects/researchly",
        score: 0.91,
        metadata: expect.objectContaining({
          imageUrl:
            "https://s3-storage.callahan.cloud/images/other/projects/researchly-research-draft-fc716b09.png",
        }),
      }),
    ]);
  });
});
