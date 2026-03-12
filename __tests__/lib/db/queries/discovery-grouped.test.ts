import { vi } from "vitest";
import {
  dedupeDiscoverSections,
  filterRecentlyAdded,
  groupByPrimaryTag,
  type ScoredBookmark,
} from "@/lib/db/queries/discovery-grouped";

function makeScoredRow(
  id: string,
  primaryTag: { slug: string; name: string } | null,
  discoveryScore: number,
  dateBookmarked: string,
): ScoredBookmark {
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
    primaryTag,
    discoveryScore,
  };
}

describe("groupByPrimaryTag", () => {
  it("groups rows by canonical tag and sorts by top score", () => {
    const rows: ScoredBookmark[] = [
      makeScoredRow("1", { slug: "ai", name: "AI" }, 0.95, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", { slug: "ai", name: "AI" }, 0.8, "2026-02-26T00:00:00Z"),
      makeScoredRow(
        "3",
        { slug: "dev-tools", name: "Developer Tools" },
        0.9,
        "2026-02-27T00:00:00Z",
      ),
      makeScoredRow(
        "4",
        { slug: "dev-tools", name: "Developer Tools" },
        0.7,
        "2026-02-25T00:00:00Z",
      ),
      makeScoredRow("5", { slug: "cloud", name: "Cloud" }, 0.6, "2026-02-24T00:00:00Z"),
    ];

    const result = groupByPrimaryTag(rows, { perSection: 6, minPerSection: 2 });

    expect(result).toHaveLength(2);
    expect(result[0].tagSlug).toBe("ai");
    expect(result[0].tagName).toBe("AI");
    expect(result[0].topScore).toBe(0.95);
    expect(result[0].totalCount).toBe(2);
    expect(result[1].tagSlug).toBe("dev-tools");
  });

  it("excludes rows with no primary tag", () => {
    const rows: ScoredBookmark[] = [
      makeScoredRow("1", null, 0.99, "2026-02-27T00:00:00Z"),
      makeScoredRow("2", { slug: "ai", name: "AI" }, 0.8, "2026-02-27T00:00:00Z"),
      makeScoredRow("3", { slug: "ai", name: "AI" }, 0.7, "2026-02-26T00:00:00Z"),
    ];

    const result = groupByPrimaryTag(rows, { perSection: 6, minPerSection: 2 });

    expect(result).toHaveLength(1);
    expect(result[0].tagSlug).toBe("ai");
  });

  it("caps section bookmarks at perSection", () => {
    const rows: ScoredBookmark[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(
        String(i),
        { slug: "ai", name: "AI" },
        0.9 - i * 0.01,
        `2026-02-2${Math.min(7, i)}T00:00:00Z`,
      ),
    );

    const result = groupByPrimaryTag(rows, { perSection: 4, minPerSection: 2 });

    expect(result[0].bookmarks).toHaveLength(4);
    expect(result[0].totalCount).toBe(10);
  });
});

describe("filterRecentlyAdded", () => {
  it("returns bookmarks from last N days sorted by score", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmark[] = [
      makeScoredRow("new1", { slug: "ai", name: "AI" }, 0.95, "2026-02-25T00:00:00Z"),
      makeScoredRow(
        "new2",
        { slug: "dev-tools", name: "Developer Tools" },
        0.8,
        "2026-02-26T00:00:00Z",
      ),
      makeScoredRow("old", { slug: "cloud", name: "Cloud" }, 0.99, "2026-02-10T00:00:00Z"),
    ];

    const result = filterRecentlyAdded(rows, { days: 7, limit: 6 });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("new1");
    expect(result[1].id).toBe("new2");

    vi.useRealTimers();
  });

  it("caps at limit", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));

    const rows: ScoredBookmark[] = Array.from({ length: 10 }, (_, i) =>
      makeScoredRow(String(i), { slug: "ai", name: "AI" }, 0.9 - i * 0.01, "2026-02-26T00:00:00Z"),
    );

    const result = filterRecentlyAdded(rows, { days: 7, limit: 3 });

    expect(result).toHaveLength(3);

    vi.useRealTimers();
  });
});

describe("dedupeDiscoverSections", () => {
  it("keeps the first occurrence based on discover rendering order", () => {
    const bookmarkA = makeScoredRow(
      "bookmark-a",
      { slug: "ai", name: "AI" },
      0.99,
      "2026-02-27T00:00:00Z",
    ).bookmark;
    const bookmarkB = makeScoredRow(
      "bookmark-b",
      { slug: "dev-tools", name: "Developer Tools" },
      0.92,
      "2026-02-26T00:00:00Z",
    ).bookmark;
    const bookmarkC = makeScoredRow(
      "bookmark-c",
      { slug: "cloud", name: "Cloud" },
      0.83,
      "2026-02-25T00:00:00Z",
    ).bookmark;

    const result = dedupeDiscoverSections(
      [bookmarkA, bookmarkB],
      [
        {
          tagSlug: "ai",
          tagName: "AI",
          topScore: 0.99,
          totalCount: 3,
          bookmarks: [bookmarkA, bookmarkC],
        },
        {
          tagSlug: "dev-tools",
          tagName: "Developer Tools",
          topScore: 0.92,
          totalCount: 2,
          bookmarks: [bookmarkB, bookmarkC],
        },
      ],
    );

    expect(result.recentBookmarks.map((bookmark) => bookmark.id)).toEqual([
      "bookmark-a",
      "bookmark-b",
    ]);
    expect(result.rankedSections).toHaveLength(1);
    expect(result.rankedSections[0]?.tagSlug).toBe("ai");
    expect(result.rankedSections[0]?.bookmarks.map((bookmark) => bookmark.id)).toEqual([
      "bookmark-c",
    ]);
    expect(result.rankedSections[0]?.totalCount).toBe(1);
  });
});
