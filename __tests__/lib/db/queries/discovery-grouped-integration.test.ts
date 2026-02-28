import {
  groupByPrimaryTag,
  filterRecentlyAdded,
  type ScoredBookmarkRow,
} from "@/lib/db/queries/discovery-grouped";

function makeRow(
  id: string,
  primaryTag: { slug: string; name: string } | null,
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
    },
    primaryTag,
    discoveryScore: score,
  };
}

describe("discovery grouped integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("produces complete discover feed primitives from canonical tags", () => {
    const rows: ScoredBookmarkRow[] = [
      makeRow("1", { slug: "ai", name: "AI" }, 0.95, "2026-02-26T00:00:00Z"),
      makeRow("2", { slug: "ai", name: "AI" }, 0.85, "2026-02-25T00:00:00Z"),
      makeRow("3", { slug: "ai", name: "AI" }, 0.75, "2026-02-20T00:00:00Z"),
      makeRow("4", { slug: "dev-tools", name: "Developer Tools" }, 0.9, "2026-02-27T00:00:00Z"),
      makeRow("5", { slug: "dev-tools", name: "Developer Tools" }, 0.8, "2026-02-26T00:00:00Z"),
      makeRow("6", { slug: "cloud", name: "Cloud" }, 0.6, "2026-01-15T00:00:00Z"),
    ];

    const recent = filterRecentlyAdded(rows, { days: 7, limit: 6 });
    const sections = groupByPrimaryTag(rows, { perSection: 6, minPerSection: 2 });

    expect(recent.length).toBeGreaterThanOrEqual(4);

    expect(sections).toHaveLength(2);
    expect(sections[0]!.tagSlug).toBe("ai");
    expect(sections[1]!.tagSlug).toBe("dev-tools");

    expect(sections[0]!.bookmarks[0]!.id).toBe("1");
    expect(sections[1]!.bookmarks[0]!.id).toBe("4");
  });
});
