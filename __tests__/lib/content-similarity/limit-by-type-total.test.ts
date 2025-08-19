import { limitByTypeAndTotal } from "@/lib/content-similarity";
import type { RelatedContentType } from "@/types/related-content";

type Item = { id: string; type: RelatedContentType; score: number };

describe("limitByTypeAndTotal", () => {
  it("returns empty array for no items", () => {
    const out = limitByTypeAndTotal([], 3, 5);
    expect(out).toEqual([]);
  });

  it("returns all when under per-type and total limits, sorted desc", () => {
    const items: Item[] = [
      { id: "a", type: "blog", score: 0.2 },
      { id: "b", type: "blog", score: 0.8 },
      { id: "c", type: "blog", score: 0.5 },
    ];
    const out = limitByTypeAndTotal(items, 5, 10);
    expect(out.map((i) => i.id)).toEqual(["b", "c", "a"]);
  });

  it("applies per-type cap before global cap", () => {
    const items: Item[] = [
      // bookmarks
      { id: "b1", type: "bookmark", score: 0.9 },
      { id: "b2", type: "bookmark", score: 0.8 },
      { id: "b3", type: "bookmark", score: 0.7 },
      // blog
      { id: "g1", type: "blog", score: 0.95 },
      { id: "g2", type: "blog", score: 0.4 },
      // projects
      { id: "p1", type: "project", score: 0.6 },
    ];

    const out = limitByTypeAndTotal(items, 2, 4);
    // Per-type caps -> bookmark: [b1,b2], blog: [g1,g2], project: [p1] then global 4 highest
    expect(out.map((i) => i.id)).toEqual(["g1", "b1", "b2", "p1"]);
  });

  it("handles equal scores; does not throw and returns correct count", () => {
    const items: Item[] = [
      { id: "a", type: "blog", score: 0.8 },
      { id: "b", type: "blog", score: 0.8 },
      { id: "c", type: "blog", score: 0.8 },
    ];
    const out = limitByTypeAndTotal(items, 2, 2);
    expect(out).toHaveLength(2);
    // Order for equal scores is not asserted; only cardinality and presence type
    expect(out.every((i) => i.type === "blog")).toBe(true);
  });

  it("treats non-positive limits as zero (returns empty)", () => {
    const items: Item[] = [
      { id: "a", type: "blog", score: 0.9 },
      { id: "b", type: "project", score: 0.8 },
    ];
    expect(limitByTypeAndTotal(items, 0, 10)).toEqual([]);
    expect(limitByTypeAndTotal(items, 2, 0)).toEqual([]);
    expect(limitByTypeAndTotal(items, -1, -5)).toEqual([]);
  });
});
