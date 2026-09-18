/**
 * searchAiAnalysis blends parent relevance with analysis match quality.
 *
 * Per [TST1d]: both terms have to reach the blend on one scale. parent.score is
 * a reciprocal-rank value capped at MAX_RECIPROCAL_RANK_SCORE (about 0.033),
 * while scoreAnalysisMatch adds up to 1.0 per matched text. Blending them raw
 * weighted the parent at under one percent and made the 0.4 weight decorative.
 *
 * @module __tests__/lib/search/ai-analysis-searcher
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_RECIPROCAL_RANK_SCORE, RRF_K } from "@/lib/db/queries/hybrid-search-config";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";

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
/** Weakest rank a semantic candidate can hold, so the weakest parent score. */
const WEAKEST_PARENT_SCORE = 1 / (RRF_K + 50);

/**
 * Only `summary` varies. Every other field is free of both query terms, so
 * scoreAnalysisMatch counts exactly one matching text and its mean strength is
 * the summary's own grade.
 */
function analysisWithSummary(summary: string): BookmarkAiAnalysisResponse {
  return {
    summary,
    category: "Reference",
    highlights: ["Covers indexing tradeoffs."],
    targetAudience: "Engineers",
    relatedResources: ["Guide to embeddings"],
    contextualDetails: { primaryDomain: "example.com", format: "Article" },
  } as unknown as BookmarkAiAnalysisResponse;
}

describe("searchAiAnalysis", () => {
  beforeEach(() => {
    mockSearchBookmarks.mockReset();
    mockGetCachedAnalysis.mockReset();
  });

  it("lets a stronger parent outrank a slightly better analysis match", async () => {
    mockSearchBookmarks.mockResolvedValue([
      {
        id: "a",
        type: "bookmark",
        title: "Alpha",
        url: "/bookmarks/alpha",
        score: MAX_RECIPROCAL_RANK_SCORE,
      },
      {
        id: "b",
        type: "bookmark",
        title: "Beta",
        url: "/bookmarks/beta",
        score: WEAKEST_PARENT_SCORE,
      },
    ]);
    mockGetCachedAnalysis.mockImplementation(async (_domain: string, id: string) =>
      id === "alpha"
        ? // both terms present, not as a phrase: graded 0.7
          { analysis: analysisWithSummary("Search strategies for vector stores.") }
        : // exact phrase: graded 1.0, the better analysis match of the two
          { analysis: analysisWithSummary("A vector search primer.") },
    );

    const results = await searchAiAnalysis(QUERY);

    // Normalized: alpha 0.4 + 0.42 = 0.82 beats beta 0.111 + 0.6 = 0.711.
    // Leaving parent.score raw drops alpha to 0.013 + 0.42 = 0.433 against
    // beta's 0.004 + 0.6 = 0.604, inverting the order — so this pins the
    // parent half of the normalization, not just the analysis half.
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.url)).toEqual(["/bookmarks/alpha", "/bookmarks/beta"]);
  });
});
