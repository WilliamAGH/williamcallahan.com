/**
 * Books Page
 * @module app/books/page
 * @description
 * Displays personal reading list sourced from AudioBookShelf and other providers.
 * Implements proper SEO with schema.org structured data.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from "next";
import { connection } from "next/server";
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
 * Runtime policy
 * cacheComponents makes routes dynamic by default; we call connection()
 * to explicitly bind this page to request time instead of relying on
 * the disallowed `dynamic = "force-dynamic"` segment config.
 */
export default async function BooksPage() {
  // Explicitly mark this route as request-time to avoid static prerendering attempts.
  await connection();

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
