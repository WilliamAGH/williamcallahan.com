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

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Opt out of the Next.js Data Cache for this route (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";
// Revalidate static HTML every 30 minutes to keep bookmark counts fresh
export const revalidate = 1800; // 30 minutes (60 * 30)

import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/bookmarks", "bookmarks");
}

export default function BookmarksPage() {
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
      url: "/images/og/bookmarks-og.png",
      width: 2100,
      height: 1100,
    },
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
