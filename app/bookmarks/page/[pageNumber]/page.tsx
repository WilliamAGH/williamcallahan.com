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

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Disable persistent Data Cache – content is updated via revalidation logic in code (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";
// Incremental Static Regeneration – recache every 30 minutes for fresh-but-fast UX
export const revalidate = 1800; // 30 minutes (60 * 30)

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { getBookmarks, getBookmarksPage, getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import type { PaginatedBookmarkContext } from "@/types";
import { PageNumberSchema } from "@/types/lib";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { UnifiedBookmark } from "@/types/bookmark";

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

  const baseMetadata = getStaticPageMetadata("/bookmarks", "bookmarks") as Metadata;

  // Add pagination-specific metadata
  const baseTitle = typeof baseMetadata.title === "string" ? baseMetadata.title : "Bookmarks";

  const title =
    pageNum === 1
      ? baseTitle
      : generateDynamicTitle("Bookmarks", "bookmarks", { isPaginated: true, pageNumber: pageNum });

  const metadata: Metadata = {
    ...baseMetadata,
    title,
    description:
      pageNum === 1 ? baseMetadata.description : `${baseMetadata.description} Page ${pageNum} of ${totalPages}.`,
    alternates: {
      ...baseMetadata.alternates,
      canonical: pageNum === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${pageNum}`),
    },
    openGraph: {
      ...baseMetadata.openGraph,
      title,
      url: pageNum === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${pageNum}`),
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

  if (pageNum > 1) {
    paginationLinks.push({
      rel: "prev",
      url: pageNum === 2 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${pageNum - 1}`),
    });
  }

  if (pageNum < totalPages) {
    paginationLinks.push({
      rel: "next",
      url: ensureAbsoluteUrl(`/bookmarks/page/${pageNum + 1}`),
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

  if (pageNum > totalPages) {
    notFound();
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

  // Fetch all bookmarks without image data for slug generation
  const allBookmarks = (await getBookmarks({
    ...DEFAULT_BOOKMARK_OPTIONS,
    includeImageData: false,
    skipExternalFetch: false,
    force: false,
  })) as UnifiedBookmark[];

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
          allBookmarksForSlugs={allBookmarks}
          initialPage={pageNum}
          totalPages={totalPages}
          totalCount={index?.count ?? 0}
          includeImageData={true}
        />
      </div>
    </>
  );
}
