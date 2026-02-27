import { computeColdStartScore, computeDiscoveryScore } from "@/lib/db/queries/discovery-scores";

describe("discovery score helpers", () => {
  it("computes higher scores for stronger engagement", () => {
    const weak = computeDiscoveryScore({
      impressions: 100,
      clicks: 2,
      avgDwellMs: 1_000,
      externalClicks: 0,
      ageInDays: 12,
    });
    const strong = computeDiscoveryScore({
      impressions: 80,
      clicks: 20,
      avgDwellMs: 90_000,
      externalClicks: 15,
      ageInDays: 2,
    });

    expect(strong).toBeGreaterThan(weak);
  });

  it("applies novelty and recency effects", () => {
    const fresh = computeDiscoveryScore({
      impressions: 2,
      clicks: 1,
      avgDwellMs: 60_000,
      externalClicks: 1,
      ageInDays: 1,
    });
    const stale = computeDiscoveryScore({
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
});
