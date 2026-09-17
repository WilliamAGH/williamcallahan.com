/**
 * searchAiAnalysis blends parent relevance with analysis match quality.
 *
 * Per [TST1d]: both terms have to reach the blend on one scale. parent.score is
 * a reciprocal-rank value capped near 0.033 while scoreAnalysisMatch adds 1.0
 * per matched text, so blending them raw let text count decide the order and
 * made the 0.4 parent weight decorative.
 *
 * @module __tests__/lib/search/ai-analysis-searcher
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECIPROCAL_RANK_SCORE } from "@/lib/db/queries/hybrid-search-config";

const { mockSearchBookmarks, mockGetCachedAnalysis } = vi.hoisted(() => ({
  mockSearchBookmarks: vi.fn(),
  mockGetCachedAnalysis: vi.fn(),
}));

vi.mock("@/lib/search/searchers/dynamic-searchers", () => ({
  searchBookmarks: mockSearchBookmarks,
  searchBooks: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/search/searchers/static-searchers", () => ({
  searchProjects: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/ai-analysis/reader.server", () => ({
  getCachedAnalysis: mockGetCachedAnalysis,
}));

import { searchAiAnalysis } from "@/lib/search/searchers/ai-analysis-searcher";

const QUERY = "vector search";

/** Neutral filler: no field here contains "vector" or "search". */
function analysis(highlights: string[]) {
  return {
    summary: "A vector search primer.",
    category: "Reference",
    highlights,
    targetAudience: "Engineers",
    relatedResources: ["Guide to embeddings"],
    contextualDetails: { primaryDomain: "example.com", format: "Article" },
  } as unknown as Parameters<typeof mockGetCachedAnalysis>[0];
}

describe("searchAiAnalysis", () => {
  beforeEach(() => {
    mockSearchBookmarks.mockReset();
    mockGetCachedAnalysis.mockReset();
  });

  it("keeps the more relevant parent first when both analyses match as strongly", async () => {
    mockSearchBookmarks.mockResolvedValue([
      {
        id: "a",
        type: "bookmark",
        title: "Alpha",
        url: "/bookmarks/alpha",
        score: MAX_RECIPROCAL_RANK_SCORE,
      },
      { id: "b", type: "bookmark", title: "Beta", url: "/bookmarks/beta", score: 1 / 110 },
    ]);
    mockGetCachedAnalysis.mockImplementation(async (_domain: string, id: string) =>
      id === "alpha"
        ? // one matching text
          { analysis: analysis(["Covers indexing tradeoffs."]) }
        : // two matching texts: a bigger raw sum, but no better a match
          { analysis: analysis(["Another vector search note."]) },
    );

    const results = await searchAiAnalysis(QUERY);

    expect(results).toHaveLength(2);
    expect(results[0]?.url).toBe("/bookmarks/alpha");
    expect(results[1]?.url).toBe("/bookmarks/beta");
  });
});
