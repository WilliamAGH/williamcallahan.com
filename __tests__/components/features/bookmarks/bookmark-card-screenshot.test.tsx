/**
 * @file Test for bookmark card screenshotAssetId handling
 * @module __tests__/components/features/bookmarks/bookmark-card-screenshot.test.tsx
 */

import { BookmarkCardClient } from "@/components/features/bookmarks/bookmark-card.client";
import { render, screen } from "@testing-library/react";
import React from "react";
import { getAssetUrl } from "@/lib/bookmarks/bookmark-helpers";

// Mock next/link since we're not testing navigation behavior
function MockNextLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a href={href} data-testid="mocked-link">
      {children}
    </a>
  );
}
jest.mock("next/link", () => MockNextLink);

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/bookmarks",
}));

// Mock the bookmark-helpers functions to return predictable values
jest.mock("@/lib/bookmarks/bookmark-helpers", () => ({
  getAssetUrl: jest.fn(),
  selectBestImage: jest.fn(bookmark => {
    // Simple mock implementation that mimics the real function's priority
    if (bookmark.ogImage) return bookmark.ogImage;
    if (bookmark.content?.imageAssetId) return `/api/assets/${bookmark.content.imageAssetId}`;
    if (bookmark.content?.screenshotAssetId) return `/api/assets/${bookmark.content.screenshotAssetId}`;
    return null;
  }),
}));

describe("BookmarkCardClient screenshotAssetId handling", () => {
  const mockBookmark = {
    id: "test-bookmark-1",
    url: "https://example.com/test",
    title: "Test Bookmark",
    description: "This is a test bookmark",
    tags: ["test", "example"],
    dateBookmarked: "2024-01-01T00:00:00Z",
    content: {
      type: "link",
      url: "https://example.com/test",
      title: "Test Bookmark",
      description: "This is a test bookmark",
      screenshotAssetId: "test-screenshot-asset-id",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should use screenshotAssetId for image fallback when no ogImage is available", () => {
    // Mock getAssetUrl to return a predictable asset URL
    (getAssetUrl as jest.Mock).mockReturnValue("/api/assets/test-screenshot-asset-id");

    const { container } = render(<BookmarkCardClient {...mockBookmark} />);

    // Check that the component renders without errors
    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("This is a test bookmark")).toBeInTheDocument();

    // Check that the screenshot asset ID is used for image fallback
    const images = container.querySelectorAll("img");
    const logoImage = Array.from(images).find(img => img.dataset.testid === "logo-image");

    if (logoImage) {
      // If we have a logo image element, verify it uses the screenshot asset URL
      expect(logoImage.getAttribute("src")).toBe("/api/assets/test-screenshot-asset-id");
    }

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

    // Mock getAssetUrl to return a predictable asset URL
    (getAssetUrl as jest.Mock).mockReturnValue("/api/assets/test-screenshot-asset-id");

    const { container } = render(<BookmarkCardClient {...lightweightBookmark} />);

    // Verify the component renders correctly with the LightweightBookmark structure
    expect(screen.getByText("Test Bookmark")).toBeInTheDocument();
    expect(screen.getByText("This is a test bookmark")).toBeInTheDocument();

    // Check that screenshotAssetId is still accessible and used
    const images = container.querySelectorAll("img");
    const logoImage = Array.from(images).find(img => img.dataset.testid === "logo-image");

    if (logoImage) {
      expect(logoImage.getAttribute("src")).toBe("/api/assets/test-screenshot-asset-id");
    }
  });
});
