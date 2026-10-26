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
import Link from "next/link";
import { Suspense } from "react";
import { BooksServer } from "@/components/features/books/books.server";
import { BooksWindow } from "@/components/features/books/books-window.client";

import { getStaticPageMetadata } from "@/lib/seo/metadata";
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
 * The window chrome and header render outside Suspense so the prerendered
 * shell carries the heading and intro copy. BooksServer reads the books
 * dataset, which resolves after the shell when the build disables "use cache",
 * so only the grid streams inside its own boundary.
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

  const linkClassName = "text-blue-600 dark:text-blue-400 hover:underline";

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <BooksWindow windowTitle="~/books">
          <div className="py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
            <div className="max-w-6xl mx-auto">
              <div className="mb-8">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                  {displayTitle}
                </h1>
                <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400">
                  {displayDescription}
                </p>
                <p className="mt-3 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  Notes and essays that build on these books are on the{" "}
                  <Link href="/blog" className={linkClassName}>
                    blog
                  </Link>
                  , related articles and references are saved in{" "}
                  <Link href="/bookmarks" className={linkClassName}>
                    bookmarks
                  </Link>
                  , and the startups I back are listed under{" "}
                  <Link href="/investments" className={linkClassName}>
                    investments
                  </Link>
                  .
                </p>
              </div>
              {pageMetadata.disclaimer && (
                <div className="mb-8 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic leading-relaxed">
                    {pageMetadata.disclaimer}
                  </p>
                </div>
              )}
              <Suspense
                fallback={
                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 sm:gap-6 lg:gap-8"
                    aria-hidden="true"
                  >
                    {Array.from({ length: 8 }, (_, index) => (
                      <div
                        key={index}
                        className="aspect-[2/3] rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse"
                      />
                    ))}
                  </div>
                }
              >
                <BooksServer
                  title={displayTitle}
                  description={displayDescription}
                  disclaimer={pageMetadata.disclaimer}
                  showHeader={false}
                  withWindow={false}
                />
              </Suspense>
            </div>
          </div>
        </BooksWindow>
      </div>
    </>
  );
}
