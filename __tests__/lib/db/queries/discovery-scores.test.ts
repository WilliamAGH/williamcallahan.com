import {
  computeBaseRecencyScore,
  computeColdStartScore,
  computeDiscoveryScore,
  computeEngagementSignal,
} from "@/lib/db/queries/discovery-scores";

describe("discovery score helpers", () => {
  it("computes higher engagement signals for stronger engagement", () => {
    const weak = computeEngagementSignal({
      impressions: 100,
      clicks: 2,
      avgDwellMs: 1_000,
      externalClicks: 0,
      ageInDays: 12,
    });
    const strong = computeEngagementSignal({
      impressions: 80,
      clicks: 20,
      avgDwellMs: 90_000,
      externalClicks: 15,
      ageInDays: 2,
    });

    expect(strong).toBeGreaterThan(weak);
  });

  it("applies novelty and recency effects to engagement signal", () => {
    const fresh = computeEngagementSignal({
      impressions: 2,
      clicks: 1,
      avgDwellMs: 60_000,
      externalClicks: 1,
      ageInDays: 1,
    });
    const stale = computeEngagementSignal({
      impressions: 2,
      clicks: 1,
      avgDwellMs: 60_000,
      externalClicks: 1,
      ageInDays: 45,
    });

    expect(fresh).toBeGreaterThan(stale);
  });

  it("cold start fallback prioritizes favorite and recent bookmarks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00.000Z"));

    const favoriteRecent = computeColdStartScore({
      isFavorite: true,
      dateBookmarked: "2026-02-26T12:00:00.000Z",
    });
    const nonFavoriteOlder = computeColdStartScore({
      isFavorite: false,
      dateBookmarked: "2026-01-10T12:00:00.000Z",
    });

    expect(favoriteRecent).toBeGreaterThan(nonFavoriteOlder);
    vi.useRealTimers();
  });

  it("defaults to newest-first base scoring when engagement coverage is unavailable", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-27T12:00:00.000Z"));

    const newestBase = computeBaseRecencyScore("2026-02-27T09:00:00.000Z");
    const olderBase = computeBaseRecencyScore("2026-02-01T09:00:00.000Z");
    const newestDiscover = computeDiscoveryScore({
      baseRecencyScore: newestBase,
      engagementSignal: null,
      engagementCoverage: 0,
    });
    const olderDiscover = computeDiscoveryScore({
      baseRecencyScore: olderBase,
      engagementSignal: null,
      engagementCoverage: 0,
    });

    expect(newestDiscover).toBeCloseTo(newestBase, 10);
    expect(newestDiscover).toBeGreaterThan(olderDiscover);
    vi.useRealTimers();
  });
});
