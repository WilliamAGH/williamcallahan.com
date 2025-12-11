/**
 * Books Page
 * @module app/books/page
 * @description
 * Displays personal reading list sourced from AudioBookShelf and other providers.
 * Implements proper SEO with schema.org structured data.
 *
 * Uses PPR (Partial Prerendering) pattern: static shell with JSON-LD and layout
 * is prerendered, while the dynamic book grid is wrapped in Suspense and uses
 * connection() internally to fetch live data at request time.
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import { Suspense } from "react";
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
 * Books page using PPR pattern.
 *
 * The page shell (JSON-LD, layout wrapper) is static and prerendered.
 * The BooksServer component is wrapped in Suspense and calls connection()
 * internally to create a "dynamic hole" that renders at request time.
 *
 * This pattern allows:
 * - Fast initial page load with static shell
 * - Fresh book data from AudioBookShelf API on each request
 * - Proper handling of bot requests (bots see the static shell + streamed content)
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
  const displayTitle = pageMetadata.uiTitle ?? pageMetadata.title.replace(" - William Callahan", "");
  const displayDescription = pageMetadata.uiDescription ?? pageMetadata.description;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <Suspense
          fallback={
            <div className="animate-pulse p-8">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-8" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                ))}
              </div>
            </div>
          }
        >
          <BooksServer title={displayTitle} description={displayDescription} disclaimer={pageMetadata.disclaimer} />
        </Suspense>
      </div>
    </>
  );
}
