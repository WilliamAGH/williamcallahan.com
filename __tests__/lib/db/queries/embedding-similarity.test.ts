const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("@/lib/db/connection", () => ({
  db: {
    execute: mockExecute,
  },
}));

import {
  computeEmbeddingBlendScore,
  findSimilarByEmbedding,
  rankEmbeddingCandidates,
} from "@/lib/db/queries/embedding-similarity";

describe("embedding-similarity query helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("excludes the source entity from similarity results", async () => {
    mockExecute.mockResolvedValueOnce([{ exists: 1 }]).mockResolvedValueOnce([
      {
        domain: "bookmark",
        entity_id: "source-1",
        title: "Source",
        content_date: "2026-02-20T00:00:00.000Z",
        similarity: 0.99,
      },
      {
        domain: "blog",
        entity_id: "related-1",
        title: "Related",
        content_date: "2026-02-19T00:00:00.000Z",
        similarity: 0.91,
      },
    ]);

    const results = await findSimilarByEmbedding("bookmark", "source-1", 10);

    expect(results).toHaveLength(1);
    expect(results[0]?.entityId).toBe("related-1");
  });

  it("returns an empty list when no source embedding exists", async () => {
    mockExecute.mockResolvedValueOnce([]);

    const results = await findSimilarByEmbedding("bookmark", "missing-id", 10);

    expect(results).toEqual([]);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("applies blended scoring weights for ranking", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T00:00:00.000Z"));

    const score = computeEmbeddingBlendScore({
      similarity: 0.8,
      contentDate: "2026-02-20T00:00:00.000Z",
      sourceDomain: "bookmark",
      candidateDomain: "blog",
      hasDescription: true,
      isFavorite: true,
      hasWordCount: true,
    });
    const ranked = rankEmbeddingCandidates({
      sourceDomain: "bookmark",
      candidates: [
        {
          domain: "bookmark",
          entityId: "b1",
          title: "Bookmark A",
          similarity: 0.8,
          contentDate: "2026-02-20T00:00:00.000Z",
        },
        {
          domain: "blog",
          entityId: "blog-1",
          title: "Blog B",
          similarity: 0.79,
          contentDate: "2026-02-25T00:00:00.000Z",
        },
      ],
      bookmarkQualityById: new Map([
        ["b1", { hasDescription: true, isFavorite: true, hasWordCount: true }],
      ]),
      maxPerDomain: 5,
      maxTotal: 2,
    });

    expect(score).toBeCloseTo(0.8573, 3);
    expect(ranked[0]?.domain).toBe("bookmark");
    vi.useRealTimers();
  });
});
