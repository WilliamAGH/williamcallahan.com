import {
  groupByCategory,
  filterRecentlyAdded,
  type ScoredBookmarkRow,
} from "@/lib/db/queries/discovery-grouped";

function makeRow(
  id: string,
  category: string | null,
  score: number,
  dateBookmarked: string,
): ScoredBookmarkRow {
  return {
    bookmark: {
      id,
      url: `https://example.com/${id}`,
      title: `Title ${id}`,
      description: `Desc ${id}`,
      slug: `slug-${id}`,
      tags: ["tag-a", "tag-b"],
      dateBookmarked,
      domain: "example.com",
      ogImage: `https://example.com/${id}.png`,
      category,
    },
    category,
    discoveryScore: score,
  };
}

describe("discovery grouped integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("produces a complete discover feed structure", () => {
    const rows: ScoredBookmarkRow[] = [
      makeRow("1", "AI", 0.95, "2026-02-26T00:00:00Z"),
      makeRow("2", "AI", 0.85, "2026-02-25T00:00:00Z"),
      makeRow("3", "AI", 0.75, "2026-02-20T00:00:00Z"),
      makeRow("4", "DevTools", 0.9, "2026-02-27T00:00:00Z"),
      makeRow("5", "DevTools", 0.8, "2026-02-26T00:00:00Z"),
      makeRow("6", "Cloud", 0.6, "2026-01-15T00:00:00Z"),
    ];

    const recent = filterRecentlyAdded(rows, { days: 7, limit: 6 });
    const sections = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    // Recently added: items 1, 2, 4, 5 are within 7 days
    expect(recent.length).toBeGreaterThanOrEqual(4);

    // Sections: AI (3 items, topScore 0.95), Developer Tools (2 items, topScore 0.90)
    // Cloud excluded (only 1 item < minPerSection 2)
    expect(sections).toHaveLength(2);
    expect(sections[0]!.category).toBe("AI");
    expect(sections[1]!.category).toBe("Developer Tools");

    // Each section's bookmarks are sorted by score descending
    expect(sections[0]!.bookmarks[0]!.id).toBe("1");
    expect(sections[1]!.bookmarks[0]!.id).toBe("4");
  });
});
