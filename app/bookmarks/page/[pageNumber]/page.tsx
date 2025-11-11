/**
 * Paginated Bookmarks Page
 * @module app/bookmarks/page/[pageNumber]/page
 * @description
 * Displays paginated collection of bookmarked resources with URL-based navigation
 * Implements proper SEO with canonical URLs and pagination metadata
 *
 * NOTE: No generateStaticParams() needed - sitemap.ts calculates total pages
 * and adds URLs directly. This avoids S3 dependency at build time.
 * @see app/sitemap.ts:213-230 - Pagination URL generation
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://developers.google.com/search/docs/specialty/ecommerce/pagination"} - Google pagination guidelines
 */

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { getBookmarksPage, getBookmarksIndex } from "@/lib/bookmarks/service.server";
import type { PaginatedBookmarkContext } from "@/types";
import { PageNumberSchema } from "@/types/lib";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";

/**
 * Dynamic rendering (Cache Components mode)
 * With cacheComponents enabled, pages are dynamic by default.
 * This paginated route fetches bookmarks from S3 at request time - no directive needed.
 */

/**
 * Generate metadata for the paginated Bookmarks page
 */
export async function generateMetadata({ params }: PaginatedBookmarkContext): Promise<Metadata> {
  const paramsResolved = await Promise.resolve(params);

  // Strict runtime validation for the dynamic route param
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Get total count for meta description (lightweight for metadata)
  const index = await getBookmarksIndex();
  const totalPages = index?.totalPages ?? 1;

  // Canonicalize when requested page exceeds available pages
  const effectivePage = Math.min(Math.max(pageNum, 1), Math.max(totalPages, 1));

  const baseMetadata = getStaticPageMetadata("/bookmarks", "bookmarks") as Metadata;

  // Add pagination-specific metadata
  const baseTitle = typeof baseMetadata.title === "string" ? baseMetadata.title : "Bookmarks";

  const title =
    effectivePage === 1
      ? baseTitle
      : generateDynamicTitle("Bookmarks", "bookmarks", { isPaginated: true, pageNumber: effectivePage });

  const metadata: Metadata = {
    ...baseMetadata,
    title,
    description:
      effectivePage === 1
        ? baseMetadata.description
        : `${baseMetadata.description} Page ${effectivePage} of ${totalPages}.`,
    alternates: {
      ...baseMetadata.alternates,
      canonical:
        effectivePage === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${effectivePage}`),
    },
    openGraph: {
      ...baseMetadata.openGraph,
      title,
      url:
        effectivePage === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${effectivePage}`),
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };

  // Build pagination link tags for SEO using icons.other workaround
  const paginationLinks: Array<{ rel: string; url: string }> = [];

  if (effectivePage > 1) {
    paginationLinks.push({
      rel: "prev",
      url:
        effectivePage === 2
          ? ensureAbsoluteUrl("/bookmarks")
          : ensureAbsoluteUrl(`/bookmarks/page/${effectivePage - 1}`),
    });
  }

  if (effectivePage < totalPages) {
    paginationLinks.push({
      rel: "next",
      url: ensureAbsoluteUrl(`/bookmarks/page/${effectivePage + 1}`),
    });
  }

  // Use icons.other as a workaround to generate <link> tags
  if (paginationLinks.length > 0) {
    metadata.icons = {
      other: paginationLinks,
    };
  }

  return metadata;
}

export default async function PaginatedBookmarksPage({ params }: PaginatedBookmarkContext) {
  const paramsResolved = await Promise.resolve(params);

  // Re-use the same Zod schema to validate/parse the page param
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Redirect page 1 to canonical /bookmarks URL with proper 301 status
  if (pageNum === 1) {
    redirect("/bookmarks");
  }

  // Get bookmarks to check if page exists (lightweight for pagination check)
  const index = await getBookmarksIndex();
  const totalPages = index?.totalPages ?? 0;

  if (totalPages > 0 && pageNum > totalPages) {
    // Redirect to last valid page rather than 404
    if (totalPages === 1) {
      redirect("/bookmarks");
    } else {
      redirect(`/bookmarks/page/${totalPages}`);
    }
  }

  const pageTitle = "Bookmarks";
  const pageDescription = "A collection of articles, websites, and resources I've bookmarked for future reference.";

  // Generate schema for this paginated bookmarks page
  const path = `/bookmarks/page/${pageNum}`;
  const pageMetadata = PAGE_METADATA.bookmarks;
  const schemaParams = {
    path,
    title: pageTitle,
    description: pageDescription,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "collection" as const,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/bookmarks", name: "Bookmarks" },
      { path, name: `Page ${pageNum}` },
    ],
  };
  const jsonLdData = generateSchemaGraph(schemaParams);

  // Fetch the data for the specific page
  const pageBookmarks = await getBookmarksPage(pageNum);

  if (pageBookmarks.length === 0 && pageNum > 1) {
    notFound();
  }

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageTitle}
          description={pageDescription}
          bookmarks={convertBookmarksToSerializable(pageBookmarks)}
          initialPage={pageNum}
          totalPages={totalPages}
          totalCount={index?.count ?? 0}
          includeImageData={true}
        />
      </div>
    </>
  );
}
