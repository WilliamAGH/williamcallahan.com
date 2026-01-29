/**
 * Book Detail Page
 * @module app/books/[book-slug]/page
 * @description
 * Displays individual book details with metadata, cover, and personal notes.
 * Uses slug-based routing for SEO-friendly URLs.
 *
 * Uses the "use cache" directive for Next.js 16 Cache Components pattern.
 * This allows the page to be cached while still fetching fresh data based on
 * cacheLife and cacheTag settings.
 *
 * @todo Investigate Google Search schema.org Book structured data
 * - Consider adding schema.org/Book type for rich search results
 * - Include author, ISBN, publisher, publication date structured data
 * - See: https://developers.google.com/search/docs/appearance/structured-data/book
 * - May need custom schema generator in lib/seo/schema.ts for book-specific markup
 */

import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BookDetail } from "@/components/features/books/book-detail";
import { RelatedContent } from "@/components/features/related-content/related-content.server";
import { RelatedContentFallback } from "@/components/features/related-content/related-content-section";
import {
  fetchBookByIdWithFallback,
  fetchBooksWithFallback,
} from "@/lib/books/audiobookshelf.server";
import { extractBookIdFromSlug, findBookBySlug } from "@/lib/books/slug-helpers";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import type { Book } from "@/types/schemas/book";
import type { BookPageProps } from "@/types/features/books";

async function getBookBySlug(
  slug: string,
  options?: { includeBlurPlaceholders?: boolean },
): Promise<{ book: Book | null; isFallback: boolean }> {
  const includeBlurPlaceholders = options?.includeBlurPlaceholders ?? false;
  const directId = extractBookIdFromSlug(slug);

  if (directId) {
    const byIdResult = await fetchBookByIdWithFallback(directId, {
      includeBlurPlaceholder: includeBlurPlaceholders,
    });
    if (byIdResult.book) {
      return { book: byIdResult.book, isFallback: byIdResult.isFallback };
    }
  }

  const result = await fetchBooksWithFallback({ includeBlurPlaceholders });
  const book = findBookBySlug(slug, result.books);
  return { book, isFallback: result.isFallback };
}

/**
 * Build dynamic OG image URL for a book
 * Constructs URL to /api/og/books with book metadata as query params
 */
function buildBookOgImageUrl(book: Book): string {
  const params = new URLSearchParams();
  params.set("title", book.title);

  if (book.authors?.length) {
    params.set("author", book.authors.join(", "));
  }

  if (book.coverUrl) {
    params.set("coverUrl", book.coverUrl);
  }

  if (book.formats?.length) {
    params.set("formats", book.formats.join(","));
  }

  return ensureAbsoluteUrl(`/api/og/books?${params.toString()}`);
}

export async function generateMetadata({
  params,
}: {
  params: { "book-slug": string };
}): Promise<Metadata> {
  const { "book-slug": slug } = await Promise.resolve(params);
  const path = `/books/${slug}`;
  const { book } = await getBookBySlug(slug, { includeBlurPlaceholders: false });

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
    book.description?.slice(0, 155) ||
    `${book.title} by ${authorText}. Part of William's reading list.`;

  // Generate dynamic OG image URL with branded background + book cover
  const ogImageUrl = buildBookOgImageUrl(book);

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
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${book.title} by ${authorText}`,
        },
      ],
      // Book-specific OpenGraph
      ...(book.authors && { authors: book.authors }),
      ...(book.isbn13 && { isbn: book.isbn13 }),
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${book.title} by ${authorText}`,
        },
      ],
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function BookPage({ params }: BookPageProps) {
  const { "book-slug": slug } = await Promise.resolve(params);
  const { book, isFallback } = await getBookBySlug(slug, { includeBlurPlaceholders: true });

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
    type: undefined, // Falls back to WebPage until schema.org/Book support is added
    image: book.coverUrl
      ? { url: ensureAbsoluteUrl(book.coverUrl), width: 400, height: 600 }
      : undefined,
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
        {isFallback && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            Showing cached book data while the library refreshes.
          </div>
        )}
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
 * Static params are intentionally omitted to keep this route dynamic under cacheComponents.
 * Book data comes from live AudioBookShelf API responses and should render at request time.
 */
