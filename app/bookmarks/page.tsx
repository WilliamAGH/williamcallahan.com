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
import { BookmarksServer } from "../../components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "../../components/seo/json-ld";
import { getStaticPageMetadata } from "../../lib/seo/metadata";
import { generateSchemaGraph } from "../../lib/seo/schema";

/**
 * Page Metadata
 * Used for SEO and JSON-LD data
 */
const PAGE_METADATA = {
  bookmarks: {
    title: "Bookmarks",
    description: "A collection of articles, websites, and resources I've bookmarked for future reference.",
    path: "/bookmarks",
  },
};

const nowIso = new Date().toISOString();

/**
 * JSON-LD Data built via centralized generator
 */
const jsonLdData = generateSchemaGraph({
  path: "/bookmarks",
  title: PAGE_METADATA.bookmarks.title,
  description: PAGE_METADATA.bookmarks.description,
  datePublished: nowIso,
  dateModified: nowIso,
  type: "bookmark-collection",
});

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/bookmarks", "bookmarks");
}

export default function BookmarksPage() {
  const pageMetadata = PAGE_METADATA.bookmarks;

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
