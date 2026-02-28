import {
  filterRecentlyAdded,
  groupByCategory,
  type ScoredBookmarkRow,
} from "@/lib/db/queries/discovery-grouped";

function makeScoredRow(
  id: string,
  category: string | null,
  discoveryScore: number,
  dateBookmarked: string,
): ScoredBookmarkRow {
  return {
    bookmark: {
      id,
      url: `https://example.com/${id}`,
      title: `Bookmark ${id}`,
      description: `Desc ${id}`,
      slug: `slug-${id}`,
      tags: [],
      dateBookmarked,
      domain: "example.com",
    },
    category,
    discoveryScore,
  };
}

describe("groupByCategory", () => {
  it("groups rows by category, sorted by topScore descending", () => {
    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("1", "AI", 0.95, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", "AI", 0.8, "2026-02-26T00:00:00Z"),
      makeScoredRow("3", "DevTools", 0.9, "2026-02-27T00:00:00Z"),
      makeScoredRow("4", "DevTools", 0.7, "2026-02-25T00:00:00Z"),
      makeScoredRow("5", "Cloud", 0.6, "2026-02-24T00:00:00Z"),
    ];

    const result = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    // AI has topScore 0.95 → first; Developer Tools 0.90 → second; Cloud excluded (only 1 < minPerSection 2)
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("AI");
    expect(result[0].topScore).toBe(0.95);
    expect(result[0].totalCount).toBe(2);
    expect(result[0].bookmarks).toHaveLength(2);
    expect(result[1].category).toBe("Developer Tools");
  });

  it("excludes rows with null category", () => {
    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("1", null, 0.99, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", "AI", 0.8, "2026-02-27T00:00:00Z"),
      makeScoredRow("3", "AI", 0.7, "2026-02-26T00:00:00Z"),
    ];

    const result = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("AI");
  });

  it("caps bookmarks per section at perSection limit", () => {
    const rows: ScoredBookmarkRow[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(String(i), "AI", 0.9 - i * 0.01, `2026-02-2${Math.min(7, i)}T00:00:00Z`),
    );

    const result = groupByCategory(rows, { perSection: 4, minPerSection: 2 });

    expect(result[0].bookmarks).toHaveLength(4);
    expect(result[0].totalCount).toBe(10);
  });

  it("collapses semantically equivalent category labels into one section", () => {
    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("1", "CLI", 0.9, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", "Command Line Tool", 0.85, "2026-02-26T00:00:00Z"),
      makeScoredRow("3", "Design", 0.8, "2026-02-25T00:00:00Z"),
      makeScoredRow("4", "Design", 0.7, "2026-02-24T00:00:00Z"),
    ];

    const result = groupByCategory(rows, { perSection: 6, minPerSection: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].category).toBe("Command Line Tools");
    expect(result[0].totalCount).toBe(2);
  });
});

describe("filterRecentlyAdded", () => {
  it("returns bookmarks from the last N days sorted by score", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmarkRow[] = [
      makeScoredRow("new1", "AI", 0.95, "2026-02-25T00:00:00Z"), // 2 days ago
      makeScoredRow("new2", "DevTools", 0.8, "2026-02-26T00:00:00Z"), // 1 day ago
      makeScoredRow("old", "Cloud", 0.99, "2026-02-10T00:00:00Z"), // 17 days ago
    ];

    const result = filterRecentlyAdded(rows, { days: 7, limit: 6 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("new1"); // higher score first
    expect(result[1].id).toBe("new2");

    vi.useRealTimers();
  });

  it("caps at limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmarkRow[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(String(i), "AI", 0.9 - i * 0.01, "2026-02-26T00:00:00Z"),
    );

    const result = filterRecentlyAdded(rows, { days: 7, limit: 3 });

    expect(result).toHaveLength(3);

    vi.useRealTimers();
  });
});
