/**
 * Book Detail Page
 * @module app/books/[book-slug]/page
 * @description
 * Displays individual book details with metadata, cover, and personal notes.
 * Uses slug-based routing for SEO-friendly URLs.
 *
 * @todo Investigate Google Search schema.org Book structured data
 * - Consider adding schema.org/Book type for rich search results
 * - Include author, ISBN, publisher, publication date structured data
 * - See: https://developers.google.com/search/docs/appearance/structured-data/book
 * - May need custom schema generator in lib/seo/schema.ts for book-specific markup
 */

"use cache";

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { BookDetail } from "@/components/features/books/book-detail";
import { RelatedContent } from "@/components/features/related-content/related-content.server";
import { RelatedContentFallback } from "@/components/features/related-content/related-content-section";
import { fetchBooks } from "@/lib/books/audiobookshelf.server";
import { findBookBySlug, generateBookSlug } from "@/lib/books/slug-helpers";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import type { Book } from "@/types/schemas/book";
import type { BookPageProps } from "@/types/features/books";

async function getBookBySlug(slug: string): Promise<Book | null> {
  "use cache";
  cacheLife("hours");

  try {
    const books = await fetchBooks();
    return findBookBySlug(slug, books);
  } catch (error) {
    console.error(`[BookPage] Failed to fetch book for slug "${slug}":`, error);
    return null;
  }
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { "book-slug": slug } = await params;
  const path = `/books/${slug}`;
  const book = await getBookBySlug(slug);

  if (!book) {
    return {
      ...getStaticPageMetadata(path, "books"),
      title: "Book Not Found",
      description: "The requested book could not be found.",
    };
  }

  const baseMetadata = getStaticPageMetadata(path, "books");
  const customTitle = generateDynamicTitle(book.title, "books");
  const authorText = book.authors?.join(", ") ?? "Unknown Author";
  const customDescription =
    book.description?.slice(0, 155) || `${book.title} by ${authorText}. Part of William's reading list.`;

  const imageUrl = book.coverUrl ? ensureAbsoluteUrl(book.coverUrl) : undefined;

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: "book",
      url: ensureAbsoluteUrl(path),
      images: imageUrl ? [{ url: imageUrl, alt: `Cover of ${book.title}` }] : baseMetadata.openGraph?.images || [],
      // Book-specific OpenGraph
      ...(book.authors && { authors: book.authors }),
      ...(book.isbn13 && { isbn: book.isbn13 }),
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      images: imageUrl ? [{ url: imageUrl, alt: `Cover of ${book.title}` }] : [],
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { "book-slug": slug } = await params;
  const book = await getBookBySlug(slug);

  if (!book) {
    return notFound();
  }

  const path = `/books/${slug}`;
  const pageMetadata = PAGE_METADATA.books;
  const authorText = book.authors?.join(", ") ?? "Unknown Author";

  const schemaParams = {
    path,
    title: book.title,
    description: book.description || `${book.title} by ${authorText}`,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "collection" as const,
    image: book.coverUrl ? { url: ensureAbsoluteUrl(book.coverUrl), width: 400, height: 600 } : undefined,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/books", name: "Books" },
      { path, name: book.title },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-6xl mx-auto">
        <Suspense
          fallback={
            <div className="animate-pulse p-8">
              <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
            </div>
          }
        >
          <BookDetail book={book} />
        </Suspense>

        <div className="mt-12">
          <Suspense fallback={<RelatedContentFallback title="Similar Content" />}>
            <RelatedContent sourceType="book" sourceId={book.id} sectionTitle="Similar Content" />
          </Suspense>
        </div>
      </div>
    </>
  );
}

/**
 * Generate static params for all books
 * Enables static generation of book pages at build time
 */
export async function generateStaticParams(): Promise<Array<{ "book-slug": string }>> {
  try {
    const books = await fetchBooks();
    return books.map(book => ({
      "book-slug": generateBookSlug(book.title, book.id),
    }));
  } catch (error) {
    console.error("[BookPage] Failed to generate static params:", error);
    return [];
  }
}
