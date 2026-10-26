/**
 * SEO metadata contracts consumed by Next.js.
 * @vitest-environment node
 */

import { createArticleMetadata, getStaticPageMetadata } from "@/lib/seo/metadata";
import { SEO_DATE_FIELDS } from "@/lib/constants";
import { isPacificDateString } from "@/types/seo";

describe("SEO Metadata", () => {
  const article = {
    title: "Test Article",
    description: "Test Description",
    url: "https://williamcallahan.com/blog/test-article",
    datePublished: "2025-01-01T12:00:00",
    dateModified: "2025-01-02T15:30:00",
    tags: ["test", "article"],
  };

  it("keeps article dates at the OpenGraph fields Next renders", () => {
    const metadata = createArticleMetadata(article);
    const og = metadata.openGraph;
    if (!og || !("type" in og) || og.type !== "article") {
      throw new Error("Expected article OpenGraph metadata");
    }

    expect(og.publishedTime).toBeDefined();
    expect(og.modifiedTime).toBeDefined();
    expect(isPacificDateString(og.publishedTime)).toBe(true);
    expect(isPacificDateString(og.modifiedTime)).toBe(true);
    expect(og.publishedTime).toBe(metadata.other?.[SEO_DATE_FIELDS.meta.published]);
    expect(og.modifiedTime).toBe(metadata.other?.[SEO_DATE_FIELDS.meta.modified]);
    expect(metadata.other).toEqual({
      [SEO_DATE_FIELDS.meta.published]: og.publishedTime,
      [SEO_DATE_FIELDS.meta.modified]: og.modifiedTime,
      [SEO_DATE_FIELDS.dublinCore.created]: og.publishedTime,
      [SEO_DATE_FIELDS.dublinCore.modified]: og.modifiedTime,
      [SEO_DATE_FIELDS.dublinCore.issued]: og.publishedTime,
    });
    expect(metadata.alternates?.canonical).toBe(article.url);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it.each([
    ["2025-01-01T12:00:00", "-08:00"],
    ["2025-07-01T12:00:00", "-07:00"],
  ])("uses the Pacific offset for %s", (datePublished, offset) => {
    const metadata = createArticleMetadata({ ...article, datePublished });
    const og = metadata.openGraph;
    if (!og || !("type" in og) || og.type !== "article") {
      throw new Error("Expected article OpenGraph metadata");
    }
    expect(og.publishedTime?.endsWith(offset)).toBe(true);
  });

  it("provides an article image and title when optional inputs are missing", () => {
    const metadata = createArticleMetadata({ ...article, tags: undefined });
    expect(metadata.title).toBeDefined();
    expect(metadata.description).toBe(article.description);
    expect(metadata.openGraph?.images).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: expect.any(String), alt: expect.any(String) }),
      ]),
    );
  });

  it("describes the blog listing as a website without article dates or pseudo-attribute names", () => {
    const metadata = getStaticPageMetadata("/blog", "blog");
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "https://williamcallahan.com/blog",
    });
    expect(metadata.openGraph).not.toHaveProperty("article");
    expect(metadata.openGraph).not.toHaveProperty("publishedTime");
    expect(metadata.openGraph).not.toHaveProperty("modifiedTime");
    expect(metadata.other).toEqual({
      [SEO_DATE_FIELDS.meta.published]: expect.any(String),
      [SEO_DATE_FIELDS.meta.modified]: expect.any(String),
      [SEO_DATE_FIELDS.dublinCore.created]: expect.any(String),
      [SEO_DATE_FIELDS.dublinCore.modified]: expect.any(String),
      [SEO_DATE_FIELDS.dublinCore.issued]: expect.any(String),
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.alternates?.canonical).toBe("https://williamcallahan.com/blog");
  });

  it("preserves profile metadata and consistent HTML/Dublin Core dates", () => {
    const metadata = getStaticPageMetadata("/experience", "experience");
    expect(metadata.openGraph).toMatchObject({
      type: "profile",
      firstName: "William",
      lastName: "Callahan",
      username: "williamcallahan",
    });
    const dates = metadata.other;
    expect(dates).toBeDefined();
    expect(dates?.[SEO_DATE_FIELDS.dublinCore.created]).toBe(
      dates?.[SEO_DATE_FIELDS.meta.published],
    );
    expect(dates?.[SEO_DATE_FIELDS.dublinCore.modified]).toBe(
      dates?.[SEO_DATE_FIELDS.meta.modified],
    );
    expect(dates?.[SEO_DATE_FIELDS.dublinCore.issued]).toBe(
      dates?.[SEO_DATE_FIELDS.meta.published],
    );
  });
});
