/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { render } from "@testing-library/react";
import { notFound, redirect } from "next/navigation";
import PaginatedBookmarksPage, { generateMetadata } from "@/app/bookmarks/page/[pageNumber]/page";
import { getBookmarks } from "@/lib/bookmarks";

// Mock dependencies
jest.mock("next/navigation", () => ({
  notFound: jest.fn(),
  redirect: jest.fn(),
}));

jest.mock("@/lib/bookmarks", () => ({
  getBookmarks: jest.fn(),
}));

jest.mock("@/lib/seo/metadata", () => ({
  getStaticPageMetadata: jest.fn(() => ({
    title: "Bookmarks",
    description: "A collection of bookmarks",
    openGraph: {
      title: "Bookmarks",
      description: "A collection of bookmarks",
    },
    alternates: {},
  })),
}));

jest.mock("@/components/features/bookmarks/bookmarks.server", () => ({
  BookmarksServer: ({ title, description, initialPage }: any) => (
    <div data-testid="bookmarks-server">
      <h1>{title}</h1>
      <p>{description}</p>
      <span data-testid="initial-page">{initialPage}</span>
    </div>
  ),
}));

jest.mock("@/components/seo/json-ld", () => ({
  JsonLdScript: ({ data }: any) => (
    <script type="application/ld+json" data-testid="json-ld">
      {JSON.stringify(data)}
    </script>
  ),
}));

describe("PaginatedBookmarksPage", () => {
  const mockGetBookmarks = getBookmarks as jest.MockedFunction<typeof getBookmarks>;
  const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
  const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

  // Set environment variable for tests
  const originalEnv = process.env.NEXT_PUBLIC_SITE_URL;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://williamcallahan.com";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = originalEnv;
  });

  const mockBookmarks = Array.from({ length: 50 }, (_, i) => ({
    id: `bookmark-${i}`,
    url: `https://example.com/${i}`,
    title: `Bookmark ${i}`,
    description: `Description ${i}`,
    tags: [],
    imageUrl: null,
    domain: "example.com",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-01",
    isFavorite: false,
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetBookmarks.mockResolvedValue(mockBookmarks);
  });

  describe("generateMetadata", () => {
    it("generates correct metadata for page 2", async () => {
      const metadata = await generateMetadata({
        params: { pageNumber: "2" },
      });

      expect(metadata.title).toBe("Bookmarks - Page 2");
      expect(metadata.description).toBe(
        "A collection of articles, websites, and resources I've bookmarked for future reference. Page 2 of 3.",
      );
      expect(metadata.alternates?.canonical).toBe("https://williamcallahan.com/bookmarks/page/2");
    });

    it("throws notFound for invalid page number", async () => {
      await generateMetadata({
        params: { pageNumber: "invalid" },
      });

      expect(mockNotFound).toHaveBeenCalled();
    });

    it("adds pagination link tags using icons.other workaround", async () => {
      const metadata = await generateMetadata({
        params: { pageNumber: "2" },
      });

      expect(metadata.icons?.other).toBeDefined();
      expect(Array.isArray(metadata.icons?.other)).toBe(true);

      const links = metadata.icons?.other as Array<{ rel: string; url: string }>;

      const prevLink = links.find((link) => link.rel === "prev");
      const nextLink = links.find((link) => link.rel === "next");

      expect(prevLink?.url).toBe("https://williamcallahan.com/bookmarks");
      expect(nextLink?.url).toBe("https://williamcallahan.com/bookmarks/page/3");
    });

    it("handles last page correctly", async () => {
      const metadata = await generateMetadata({
        params: { pageNumber: "3" },
      });

      const links = metadata.icons?.other as Array<{ rel: string; url: string }>;

      const prevLink = links?.find((link) => link.rel === "prev");
      const nextLink = links?.find((link) => link.rel === "next");

      expect(prevLink?.url).toBe("https://williamcallahan.com/bookmarks/page/2");
      expect(nextLink).toBeUndefined();
    });
  });

  describe("Page Component", () => {
    it("redirects page 1 to canonical /bookmarks", async () => {
      await PaginatedBookmarksPage({
        params: { pageNumber: "1" },
      });

      expect(mockRedirect).toHaveBeenCalledWith("/bookmarks");
    });

    it("renders page 2 correctly", async () => {
      const result = await PaginatedBookmarksPage({
        params: { pageNumber: "2" },
      });

      // For async server components, we need to render the result
      const { container } = render(result);

      const bookmarksServer = container.querySelector('[data-testid="bookmarks-server"]');
      expect(bookmarksServer).toBeInTheDocument();

      const initialPage = container.querySelector('[data-testid="initial-page"]');
      expect(initialPage?.textContent).toBe("2");
    });

    it("returns 404 for non-existent page", async () => {
      await PaginatedBookmarksPage({
        params: { pageNumber: "10" },
      });

      expect(mockNotFound).toHaveBeenCalled();
    });

    it("includes correct JSON-LD data", async () => {
      const result = await PaginatedBookmarksPage({
        params: { pageNumber: "2" },
      });

      // For async server components, we need to render the result
      const { container } = render(result);

      const jsonLd = container.querySelector('[data-testid="json-ld"]');
      const data = JSON.parse(jsonLd?.textContent || "{}");

      expect(data["@type"]).toBe("CollectionPage");
      expect(data.name).toBe("Bookmarks - Page 2");
      expect(data.url).toBe("https://williamcallahan.com/bookmarks/page/2");
      expect(data.position).toBe(2);
    });
  });
});
