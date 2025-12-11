/**
 * Books Page
 * @module app/books/page
 * @description
 * Displays personal reading list sourced from AudioBookShelf and other providers.
 * Implements proper SEO with schema.org structured data.
 *
 * This route is explicitly marked as dynamic because:
 * 1. Book data is fetched from an external API (AudioBookShelf) at request time
 * 2. Using `dynamic = 'force-dynamic'` prevents Next.js 16 from attempting
 *    static generation when bots visit, which would cause DYNAMIC_SERVER_USAGE errors
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from "next";
import { BooksServer } from "@/components/features/books/books.server";

/**
 * Force dynamic rendering for this route.
 * This prevents Next.js from attempting static generation when bots visit,
 * avoiding DYNAMIC_SERVER_USAGE errors in production.
 */
export const dynamic = "force-dynamic";

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

export default async function BooksPage() {
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
  const displayTitle = pageMetadata.uiTitle ?? pageMetadata.title.replace(" - William Callahan", "");
  const displayDescription = pageMetadata.uiDescription ?? pageMetadata.description;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <BooksServer title={displayTitle} description={displayDescription} disclaimer={pageMetadata.disclaimer} />
      </div>
    </>
  );
}
