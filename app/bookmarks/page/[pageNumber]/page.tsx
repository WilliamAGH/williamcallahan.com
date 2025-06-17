/**
 * Paginated Bookmarks Page
 * @module app/bookmarks/page/[pageNumber]/page
 * @description
 * Displays paginated collection of bookmarked resources with URL-based navigation
 * Implements proper SEO with canonical URLs and pagination metadata
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://developers.google.com/search/docs/specialty/ecommerce/pagination"} - Google pagination guidelines
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Incremental Static Regeneration – recache every minute for fresh-but-fast UX
export const revalidate = 60;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "../../../../components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "../../../../components/seo/json-ld";
import { getStaticPageMetadata } from "../../../../lib/seo/metadata";
import { getBookmarks } from "../../../../lib/data-access/bookmarks";
import { z } from "zod";

interface PageProps {
  params: {
    pageNumber: string;
  };
}

/**
 * Page Metadata for paginated bookmarks
 */
const PAGE_METADATA = {
  bookmarks: {
    title: "Bookmarks",
    description:
      "A collection of articles, websites, and resources I've bookmarked for future reference.",
    path: "/bookmarks",
  },
};

/**
 * Generate metadata for the paginated Bookmarks page
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const paramsResolved = await Promise.resolve(params);
  
  // Strict runtime validation for the dynamic route param
  const PageParam = z.coerce.number().int().min(1);
  let pageNum: number;
  try {
    pageNum = PageParam.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Get total count for meta description
  const bookmarks = await getBookmarks();
  const totalPages = Math.ceil(bookmarks.length / 24);

  const baseMetadata = getStaticPageMetadata("/bookmarks", "bookmarks") as Metadata;
  
  // Add pagination-specific metadata
  const metadata: Metadata = {
    ...baseMetadata,
    title: pageNum === 1 
      ? baseMetadata.title 
      : `${PAGE_METADATA.bookmarks.title} - Page ${pageNum}`,
    description: pageNum === 1
      ? baseMetadata.description
      : `${PAGE_METADATA.bookmarks.description} Page ${pageNum} of ${totalPages}.`,
    alternates: {
      ...baseMetadata.alternates,
      canonical: pageNum === 1 
        ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks`
        : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/page/${pageNum}`,
    },
    openGraph: baseMetadata.openGraph ? {
      ...baseMetadata.openGraph,
      title: pageNum === 1 
        ? PAGE_METADATA.bookmarks.title 
        : `${PAGE_METADATA.bookmarks.title} - Page ${pageNum}`,
      url: pageNum === 1 
        ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks`
        : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/page/${pageNum}`,
    } : undefined,
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };

  // Build pagination link tags for SEO using explicit record to satisfy TS
  const extra: Record<string, string> = {};
  if (pageNum > 1) {
    extra["link:prev"] = pageNum === 2
      ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks`
      : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/page/${pageNum - 1}`;
  }
  if (pageNum < totalPages) {
    extra["link:next"] = `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/page/${pageNum + 1}`;
  }
  metadata.other = {
    ...(metadata.other as Record<string, string> | undefined),
    ...extra,
  };

  return metadata;
}

export default async function PaginatedBookmarksPage({ params }: PageProps) {
  const paramsResolved = await Promise.resolve(params);
  
  // Re-use the same Zod schema to validate/parse the page param
  const PageParam = z.coerce.number().int().min(1);
  let pageNum: number;
  try {
    pageNum = PageParam.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Redirect page 1 to canonical /bookmarks URL with proper 301 status
  if (pageNum === 1) {
    redirect("/bookmarks");
  }

  // Get bookmarks to check if page exists
  const bookmarks = await getBookmarks();
  const totalPages = Math.ceil(bookmarks.length / 24);
  
  if (pageNum > totalPages) {
    notFound();
  }

  const pageMetadata = PAGE_METADATA.bookmarks;

  // JSON-LD for paginated collection
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${pageMetadata.title} - Page ${pageNum}`,
    description: `${pageMetadata.description} Page ${pageNum} of ${totalPages}.`,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/page/${pageNum}`,
    isPartOf: {
      "@type": "Collection",
      name: pageMetadata.title,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks`,
    },
    position: pageNum,
  };

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer 
          title={pageMetadata.title} 
          description={pageMetadata.description}
          initialPage={pageNum}
        />
      </div>
    </>
  );
}