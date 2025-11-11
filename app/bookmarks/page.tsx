/**
 * Bookmarks Page
 * @module app/bookmarks/page
 * @description
 * Displays curated collection of bookmarked resources
 * Implements proper SEO with schema.org structured data
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { headers } from "next/headers";
import { connection } from "next/server";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/bookmarks", "bookmarks");
}

export default async function BookmarksPage() {
  if (typeof noStore === "function") {
    noStore();
  }

  // Touch request metadata immediately so Next knows this route is dynamic.
  void headers();

  if (typeof connection === "function") {
    await connection();
  }

  const pageMetadata = PAGE_METADATA.bookmarks;

  // Generate JSON-LD schema for the bookmarks page
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/bookmarks",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    image: {
      url: getStaticImageUrl("/images/og/bookmarks-og.png"),
      width: 2100,
      height: 1100,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/bookmarks", name: "Bookmarks" },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageMetadata.title}
          description={pageMetadata.description}
          initialPage={1}
          includeImageData={true}
        />
      </div>
    </>
  );
}
