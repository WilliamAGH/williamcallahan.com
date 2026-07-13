/**
 * @file Test for bookmark card screenshotAssetId handling
 * @module __tests__/components/features/bookmarks/bookmark-card-screenshot.test.tsx
 */

import { vi } from "vitest";
import { BookmarkCardClient } from "@/components/features/bookmarks/bookmark-card.client";
import { BookmarkDetail } from "@/components/features/bookmarks/bookmark-detail";
import { ExternalLink } from "@/components/ui/external-link.client";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { unifiedBookmarkSchema } from "@/types/schemas/bookmark";
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import React from "react";

// Mock next/link since we're not testing navigation behavior
function MockNextLink({ children, href }: Readonly<{ children: React.ReactNode; href: string }>) {
  return (
    <a href={href} data-testid="mocked-link">
      {children}
    </a>
  );
}
vi.mock("next/link", () => ({ default: MockNextLink }));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    div: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  },
  useScroll: () => ({ scrollY: null }),
  useTransform: () => 0,
}));

vi.mock("@/components/features/bookmarks/bookmarks-window.client", () => ({
  BookmarksWindow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/features/bookmarks/bookmark-ai-analysis.client", () => ({
  BookmarkAiAnalysis: () => null,
  BookmarkAiContext: () => null,
  BookmarkAiRelated: () => null,
}));

vi.mock("@/components/ui/context-notes/terminal-context.client", () => ({
  TerminalContext: () => null,
}));

vi.mock("@/hooks/use-engagement-tracker", () => ({
  useEngagementTracker: () => ({
    trackDwell: () => undefined,
    trackExternalClick: () => undefined,
  }),
}));

describe("BookmarkCardClient screenshotAssetId handling", () => {
  const mockBookmark = {
    id: "test-bookmark-1",
    url: "https://example.com/test",
    title: "Test Bookmark",
    description: "This is a test bookmark",
    slug: "test-bookmark",
    tags: ["test", "example"],
    dateBookmarked: "2024-01-01T00:00:00Z",
    sourceUpdatedAt: "2024-01-01T00:00:00Z",
    content: {
      type: "link",
      url: "https://example.com/test",
      title: "Test Bookmark",
      description: "This is a test bookmark",
      screenshotAssetId: "test-screenshot-asset-id",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePathname).mockReturnValue("/bookmarks");
  });

  it("should use screenshotAssetId for image fallback when no ogImage is available", () => {
    const { container } = render(<BookmarkCardClient {...mockBookmark} />);

    // Check that the component renders without errors
    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("This is a test bookmark")).toBeInTheDocument();

    expect(screen.getByAltText("Test Bookmark")).toHaveAttribute(
      "src",
      "/api/assets/test-screenshot-asset-id",
    );

    // The component should successfully render even when no image is found
    expect(container.querySelector(".relative.flex.flex-col")).toBeInTheDocument();
  });

  it("should handle missing screenshotAssetId gracefully", () => {
    const bookmarkWithoutScreenshot = {
      ...mockBookmark,
      content: {
        ...mockBookmark.content,
        screenshotAssetId: undefined,
      },
    };

    const { container } = render(<BookmarkCardClient {...bookmarkWithoutScreenshot} />);

    // Should still render the card even without screenshotAssetId
    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("This is a test bookmark")).toBeInTheDocument();

    // Should have the main card structure
    expect(container.querySelector(".relative.flex.flex-col")).toBeInTheDocument();
  });

  it.each(["default", "compact"] as const)(
    "does not render an outbound link or domain for an about:blank %s bookmark",
    (variant) => {
      const internalHref = buildBookmarkPath("unknown-url");
      const { container } = render(
        <BookmarkCardClient
          {...mockBookmark}
          url="about:blank"
          slug="unknown-url"
          tags={[]}
          variant={variant}
          internalHref={internalHref}
        />,
      );

      expect(container.querySelector('a[target="_blank"]')).not.toBeInTheDocument();
      expect(container.querySelector('a[href="about:blank"]')).not.toBeInTheDocument();
      expect(container.querySelector(`a[href="${internalHref}"]`)).toBeInTheDocument();
      expect(screen.queryByText("about:blank")).not.toBeInTheDocument();
      expect(screen.queryByText("website")).not.toBeInTheDocument();
    },
  );

  it.each(["default", "compact"] as const)(
    "renders an unlinked title and image for an about:blank %s detail route",
    (variant) => {
      const internalHref = buildBookmarkPath("unknown-url");
      vi.mocked(usePathname).mockReturnValue(internalHref);

      const { container } = render(
        <BookmarkCardClient
          {...mockBookmark}
          url="about:blank"
          slug="unknown-url"
          tags={[]}
          variant={variant}
          internalHref={internalHref}
        />,
      );

      const title = screen.getByRole("heading", { name: "Test Bookmark" });
      expect(container.querySelector('a[target="_blank"]')).not.toBeInTheDocument();
      expect(container.querySelector(`a[href="${internalHref}"]`)).not.toBeInTheDocument();
      expect(title).toBeVisible();
      expect(screen.getByAltText("Test Bookmark")).toBeVisible();
      expect(title.parentElement).toHaveClass("text-gray-900");
      expect(container.querySelector(".aspect-video > div.absolute.inset-0.block")).toBeVisible();
      expect(container.querySelector(".aspect-video > span > div")).not.toBeInTheDocument();
      expect(title.parentElement?.tagName).not.toBe("SPAN");
    },
  );

  it("should preserve screenshotAssetId in LightweightBookmark structure", () => {
    // This test verifies that the LightweightBookmark type properly preserves
    // screenshotAssetId even when other image fields are stripped

    const lightweightBookmark = {
      ...mockBookmark,
      ogImage: undefined, // This field gets stripped in LightweightBookmark
      content: {
        type: mockBookmark.content.type,
        url: mockBookmark.content.url,
        title: mockBookmark.content.title,
        description: mockBookmark.content.description,
        screenshotAssetId: mockBookmark.content.screenshotAssetId, // This should remain
        favicon: undefined,
        author: null,
        publisher: null,
        datePublished: null,
        dateModified: null,
        imageUrl: undefined, // These heavy fields are stripped
        imageAssetId: undefined,
        htmlContent: undefined,
        crawledAt: undefined,
      },
    };

    render(<BookmarkCardClient {...lightweightBookmark} />);

    // Verify the component renders correctly with the LightweightBookmark structure
    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("This is a test bookmark")).toBeInTheDocument();

    expect(screen.getByAltText("Test Bookmark")).toHaveAttribute(
      "src",
      "/api/assets/test-screenshot-asset-id",
    );
  });
});

describe("Bookmark URL-less link behavior", () => {
  const urlLessBookmark = unifiedBookmarkSchema.parse({
    id: "url-less-bookmark",
    url: "about:blank",
    title: "URL-less bookmark",
    description: "A bookmark that has no external destination.",
    slug: "url-less-bookmark",
    tags: [],
    dateBookmarked: "2024-01-01T00:00:00Z",
    sourceUpdatedAt: "2024-01-01T00:00:00Z",
  });

  it("renders a span when an external href is null", () => {
    render(<ExternalLink href={null}>Unavailable destination</ExternalLink>);

    const fallback = screen.getByText("Unavailable destination");
    expect(fallback.tagName).toBe("SPAN");
    expect(screen.queryByRole("link", { name: "Unavailable destination" })).not.toBeInTheDocument();
  });

  it("keeps a URL-less bookmark detail page free of outbound anchors", () => {
    const { container } = render(<BookmarkDetail bookmark={urlLessBookmark} />);

    const title = screen.getByRole("heading", { name: "URL-less bookmark" });
    expect(title.querySelector("a")).not.toBeInTheDocument();
    expect(title.querySelector("span")).toHaveTextContent("URL-less bookmark");
    expect(container.querySelector('a[target="_blank"]')).not.toBeInTheDocument();
    expect(container.querySelector('a[href="about:blank"]')).not.toBeInTheDocument();
  });
});
