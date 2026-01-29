/**
 * Books Page
 * @module app/books/page
 * @description
 * Displays personal reading list sourced from AudioBookShelf and other providers.
 * Implements proper SEO with schema.org structured data.
 *
 * Runtime policy: cacheComponents disallows route-level `dynamic` flags;
 * freshness comes from the book data fetches that opt into `no-store` semantics
 * instead of build-time snapshots.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from "next";
import { BooksServer } from "@/components/features/books/books.server";

import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

/**
 * Generate metadata for the Books page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/books", "books");
}

/**
 * Books page matching the bookmarks pattern.
 *
 * Renders BooksServer directly without Suspense at page level.
 * The server component handles data fetching using the Cache Components pattern
 * (cacheLife/cacheTag) rather than PPR/connection().
 */
export default function BooksPage() {
  const pageMetadata = PAGE_METADATA.books;

  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/books",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    image: {
      url: getStaticImageUrl("/images/og/default-og.png"),
      width: 2100,
      height: 1100,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/books", name: "Books" },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  // Use uiTitle/uiDescription for on-page display, falling back to meta values
  const displayTitle =
    pageMetadata.uiTitle ?? pageMetadata.title.replace(" - William Callahan", "");
  const displayDescription = pageMetadata.uiDescription ?? pageMetadata.description;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <BooksServer
          title={displayTitle}
          description={displayDescription}
          disclaimer={pageMetadata.disclaimer}
        />
      </div>
    </>
  );
}
