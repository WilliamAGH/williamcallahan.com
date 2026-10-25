/** @vitest-environment node */

import { PAGE_METADATA, SITE_NAME } from "@/data/metadata";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import type { SchemaParams } from "@/types/seo/schema";

const collectionParams: SchemaParams = {
  path: "/blog",
  title: "Blog",
  description: "Published articles",
  datePublished: "2025-01-01T00:00:00-08:00",
  dateModified: "2025-01-02T00:00:00-08:00",
  breadcrumbs: [
    { path: "/", name: "Home" },
    { path: "/blog", name: "Blog" },
  ],
};

describe.each(["collection", "bookmark-collection"] as const)("%s schema", (type) => {
  it.each([undefined, []])("omits unsupported membership for itemList %j", (itemList) => {
    const graph = generateSchemaGraph({ ...collectionParams, type, itemList });
    const collection = graph["@graph"].find((entity) => entity["@type"] === "CollectionPage");

    expect(collection).toBeDefined();
    expect(collection).not.toHaveProperty("mainEntity");
    expect(graph["@graph"].find((entity) => entity["@type"] === "BreadcrumbList")).toMatchObject({
      itemListElement: [
        { position: 1, item: { "@id": ensureAbsoluteUrl("/"), name: "Home" } },
        { position: 2, item: { "@id": ensureAbsoluteUrl("/blog"), name: "Blog" } },
      ],
    });
  });

  it("lists only the supplied collection members in order", () => {
    const graph = generateSchemaGraph({
      ...collectionParams,
      type,
      itemList: [
        { url: "/blog/first-post", position: 1 },
        { url: "/blog/second-post", position: 2 },
      ],
    });

    expect(graph["@graph"].find((entity) => entity["@type"] === "CollectionPage")).toMatchObject({
      mainEntity: {
        "@type": "ItemList",
        itemListElement: [
          { "@type": "ListItem", position: 1, url: ensureAbsoluteUrl("/blog/first-post") },
          { "@type": "ListItem", position: 2, url: ensureAbsoluteUrl("/blog/second-post") },
        ],
      },
    });
  });
});

describe("profile schema", () => {
  it.each(["home", "experience", "education", "cv"] as const)(
    "describes %s without unsupported interaction counters",
    (pageKey) => {
      const pageMetadata = PAGE_METADATA[pageKey];
      const graph = generateSchemaGraph({
        ...collectionParams,
        path: pageKey === "home" ? "/" : `/${pageKey}`,
        type: "profile",
        profileMetadata: pageMetadata,
      });
      const profile = graph["@graph"].find((entity) => entity["@type"] === "ProfilePage");

      expect(profile).toMatchObject({ mainEntity: { "@type": "Person", name: SITE_NAME } });
      expect(profile).not.toHaveProperty("mainEntity.interactionStatistic");
      expect(profile).not.toHaveProperty("mainEntity.agentInteractionStatistic");
    },
  );
});
