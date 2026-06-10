import { describe, expect, it } from "vitest";
import { hydrateEnrichment, needsKarakeepImageUpgrade } from "@/lib/bookmarks/enrichment-hydration";
import { unifiedBookmarkSchema, type UnifiedBookmark } from "@/types/schemas/bookmark";

const TIMESTAMP = "2026-01-01T00:00:00.000Z";

function buildBookmark(overrides: Partial<UnifiedBookmark> = {}): UnifiedBookmark {
  return unifiedBookmarkSchema.parse({
    id: "bm-1",
    slug: "example-com-bm-1",
    url: "https://example.com/article",
    title: "Example",
    description: "",
    tags: [],
    dateBookmarked: TIMESTAMP,
    sourceUpdatedAt: TIMESTAMP,
    ...overrides,
  });
}

describe("hydrateEnrichment", () => {
  it("fills missing enrichment fields from the prior persisted row", () => {
    const fresh = buildBookmark();
    const prior = buildBookmark({
      ogImage: "https://s3-storage.callahan.cloud/images/opengraph/example-com-abcd1234.png",
      ogTitle: "Persisted title",
      readingTime: 4,
    });

    const [hydrated] = hydrateEnrichment([fresh], [prior]);

    expect(hydrated?.ogImage).toBe(prior.ogImage);
    expect(hydrated?.ogTitle).toBe("Persisted title");
    expect(hydrated?.readingTime).toBe(4);
  });

  it("never overwrites enrichment already present on the fresh bookmark", () => {
    const fresh = buildBookmark({ ogTitle: "Fresh title" });
    const prior = buildBookmark({ ogTitle: "Stale title" });

    const [hydrated] = hydrateEnrichment([fresh], [prior]);

    expect(hydrated?.ogTitle).toBe("Fresh title");
  });

  it("leaves bookmarks without a prior row untouched", () => {
    const fresh = buildBookmark({ id: "new-bookmark" });

    const [hydrated] = hydrateEnrichment([fresh], [buildBookmark()]);

    expect(hydrated?.ogImage).toBeUndefined();
  });
});

describe("needsKarakeepImageUpgrade", () => {
  const content = {
    type: "link",
    url: "https://example.com/article",
    title: "Example",
    description: null,
    imageAssetId: "asset-1",
  } satisfies NonNullable<UnifiedBookmark["content"]>;

  it("is true when a Karakeep asset exists but ogImage is missing", () => {
    expect(needsKarakeepImageUpgrade(buildBookmark({ content }))).toBe(true);
  });

  it("is true when ogImage is still a proxy URL", () => {
    expect(
      needsKarakeepImageUpgrade(buildBookmark({ content, ogImage: "/api/assets/asset-1" })),
    ).toBe(true);
  });

  it("is true when ogImage is still the Karakeep content-image fallback", () => {
    const fallbackUrl = "https://karakeep.example/favicon.ico";

    expect(
      needsKarakeepImageUpgrade(
        buildBookmark({
          content: { ...content, imageUrl: fallbackUrl },
          ogImage: fallbackUrl,
        }),
      ),
    ).toBe(true);
  });

  it("is false once ogImage points at the CDN", () => {
    expect(
      needsKarakeepImageUpgrade(
        buildBookmark({
          content,
          ogImage: "https://s3-storage.callahan.cloud/images/opengraph/example-com-abcd1234.png",
        }),
      ),
    ).toBe(false);
  });

  it("is false when the bookmark has no Karakeep assets", () => {
    expect(needsKarakeepImageUpgrade(buildBookmark())).toBe(false);
  });
});
