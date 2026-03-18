/**
 * @vitest-environment node
 *
 * Regression tests for content hydration image resolution.
 * Validates that hydrateBookmarks uses selectBestImage (not raw ogImage)
 * and that hydrateBlogPosts uses canonical CDN resolution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mocks so factory closures can reference them before module initialization
const { mockDbRows, mockSelectBestImage } = vi.hoisted(() => {
  const mockDbRows: Record<string, unknown>[] = [];
  const mockSelectBestImage = vi.fn();
  return { mockDbRows, mockSelectBestImage };
});

vi.mock("@/lib/db/connection", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(mockDbRows)),
      })),
    })),
  },
}));

vi.mock("@/lib/utils/cdn-utils", () => ({
  getCdnConfigFromEnv: vi.fn(() => ({
    cdnBaseUrl: "https://s3-storage.callahan.cloud",
    s3BucketName: undefined,
    s3ServerUrl: undefined,
  })),
  isOurCdnUrl: vi.fn((url: string) => url.startsWith("https://s3-storage.callahan.cloud")),
  buildCdnUrl: vi.fn((key: string) => `https://s3-storage.callahan.cloud/${key}`),
  getBlogPostImageCdnUrl: vi.fn(),
}));

vi.mock("@/lib/bookmarks/bookmark-helpers", () => ({
  selectBestImage: mockSelectBestImage,
}));

vi.mock("@/lib/seo/url-utils", () => ({
  resolveImageUrl: vi.fn((url?: string) => url),
}));

vi.mock("@/lib/db/queries/investment-logo-resolver", () => ({
  resolveInvestmentLogo: vi.fn().mockResolvedValue("/images/placeholder.png"),
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
vi.mock("@/lib/db/schema/projects", () => ({ projects: {} }));
vi.mock("@/lib/db/schema/books-individual", () => ({ booksIndividual: {} }));
vi.mock("@/lib/db/schema/thoughts", () => ({ thoughts: {} }));
vi.mock("drizzle-orm", () => ({
  inArray: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
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
});
