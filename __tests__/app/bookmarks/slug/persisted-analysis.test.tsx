import React from "react";
import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildBookmark } from "@/test-utils/sitemap-factories";
import type { BookmarkDetailProps } from "@/types/bookmark-ai-analysis";
import type { CachedAnalysis } from "@/types/ai-analysis";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";

const { mockGetCachedAnalysis, mockResolveBookmarkIdFromSlug, mockGetBookmarkById } = vi.hoisted(
  () => ({
    mockGetCachedAnalysis: vi.fn(),
    mockResolveBookmarkIdFromSlug: vi.fn(),
    mockGetBookmarkById: vi.fn(),
  }),
);

vi.mock("@/lib/ai-analysis/reader.server", () => ({
  __esModule: true,
  getCachedAnalysis: mockGetCachedAnalysis,
}));

vi.mock("@/lib/bookmarks/slug-helpers", () => ({
  __esModule: true,
  resolveBookmarkIdFromSlug: mockResolveBookmarkIdFromSlug,
}));

vi.mock("@/lib/bookmarks/service.server", () => ({
  __esModule: true,
  getBookmarkById: mockGetBookmarkById,
}));

vi.mock("@/components/features/bookmarks/bookmark-detail", () => ({
  __esModule: true,
  BookmarkDetail: ({ cachedAnalysis }: BookmarkDetailProps) => (
    <div data-testid="bookmark-detail">{cachedAnalysis?.metadata.generatedAt ?? "none"}</div>
  ),
}));

vi.mock("@/components/features/related-content/related-content.server", () => ({
  __esModule: true,
  RelatedContent: () => null,
}));

const bookmark = buildBookmark("krrlhn43iwpgyoa4fi2c8r6j", { slug: "killaislop-com" });
const persisted: CachedAnalysis<BookmarkAiAnalysisResponse> = {
  metadata: { generatedAt: "2026-09-15T19:52:39.067Z", modelVersion: "v1" },
  analysis: {
    summary: "A field guide to AI design slop.",
    category: "Design",
    highlights: ["Catalogs common slop patterns"],
    contextualDetails: { primaryDomain: "UI design", format: "reference", accessMethod: "free" },
    relatedResources: ["Design systems"],
    targetAudience: "Designers",
  },
};

describe("bookmark detail page persisted analysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveBookmarkIdFromSlug.mockResolvedValue(bookmark.id);
    mockGetBookmarkById.mockResolvedValue(bookmark);
  });

  it("renders the persisted analysis so the client does not regenerate", async () => {
    mockGetCachedAnalysis.mockResolvedValue(persisted);
    const { default: BookmarkPage } = await import("@/app/bookmarks/[slug]/page");

    render(await BookmarkPage({ params: Promise.resolve({ slug: bookmark.slug }) }));

    expect(screen.getByTestId("bookmark-detail")).toHaveTextContent(persisted.metadata.generatedAt);
  });

  it("fails the render when the persisted analysis read throws instead of serving no analysis", async () => {
    mockGetCachedAnalysis.mockRejectedValue(new Error("CONNECT_TIMEOUT"));
    const { default: BookmarkPage } = await import("@/app/bookmarks/[slug]/page");

    await expect(
      BookmarkPage({ params: Promise.resolve({ slug: bookmark.slug }) }),
    ).rejects.toThrow("CONNECT_TIMEOUT");
  });
});
