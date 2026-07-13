/**
 * @file Test for bookmark card screenshotAssetId handling
 * @module __tests__/components/features/bookmarks/bookmark-card-screenshot.test.tsx
 */

import { vi } from "vitest";
import { BookmarkCardClient } from "@/components/features/bookmarks/bookmark-card.client";
import { render, screen } from "@testing-library/react";
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
  usePathname: () => "/bookmarks",
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
      const { container } = render(
        <BookmarkCardClient
          {...mockBookmark}
          url="about:blank"
          slug="unknown-url"
          tags={[]}
          variant={variant}
          internalHref="/bookmarks/unknown-url"
        />,
      );

      expect(container.querySelector('a[target="_blank"]')).not.toBeInTheDocument();
      expect(container.querySelector('a[href="about:blank"]')).not.toBeInTheDocument();
      expect(container.querySelector('a[href="/bookmarks/unknown-url"]')).toBeInTheDocument();
      expect(screen.queryByText("about:blank")).not.toBeInTheDocument();
      expect(screen.queryByText("website")).not.toBeInTheDocument();
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
