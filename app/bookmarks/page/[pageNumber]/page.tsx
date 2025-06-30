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
// Disable persistent Data Cache – content is updated via revalidation logic in code (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";
// Incremental Static Regeneration – recache every 30 minutes for fresh-but-fast UX
export const revalidate = 1800; // 30 minutes (60 * 30)

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "../../../../components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "../../../../components/seo/json-ld";
import { getStaticPageMetadata } from "../../../../lib/seo/metadata";
import { generateDynamicTitle } from "../../../../lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "../../../../lib/seo/utils";
import { getBookmarks } from "../../../../lib/bookmarks/service.server";
import type { PaginatedBookmarkContext, UnifiedBookmark } from "@/types";
import { PageNumberSchema } from "@/types/lib";
import { generateSchemaGraph } from "../../../../lib/seo/schema";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";

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
  const bookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
  const totalPages = Math.ceil(bookmarks.length / 24);

  const baseMetadata = getStaticPageMetadata("/bookmarks", "bookmarks") as Metadata;

  // Add pagination-specific metadata
  const baseTitle = typeof baseMetadata.title === "string" ? baseMetadata.title : "Bookmarks";

  const title =
    pageNum === 1
      ? baseTitle
      : generateDynamicTitle("Bookmarks", "default", { isPaginated: true, pageNumber: pageNum });

  const metadata: Metadata = {
    ...baseMetadata,
    title,
    description:
      pageNum === 1 ? baseMetadata.description : `${baseMetadata.description} Page ${pageNum} of ${totalPages}.`,
    alternates: {
      ...baseMetadata.alternates,
      canonical: pageNum === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${pageNum}`),
    },
    openGraph: baseMetadata.openGraph
      ? {
          ...baseMetadata.openGraph,
          title,
          url: pageNum === 1 ? ensureAbsoluteUrl("/bookmarks") : ensureAbsoluteUrl(`/bookmarks/page/${pageNum}`),
        }
      : undefined,
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
  const bookmarks = (await getBookmarks({ includeImageData: false })) as UnifiedBookmark[];
  const totalPages = Math.ceil(bookmarks.length / 24);

  if (pageNum > totalPages) {
    notFound();
  }

  const pageTitle = "Bookmarks";
  const pageDescription = "A collection of articles, websites, and resources I've bookmarked for future reference.";

  // Build itemList for this page (24 per page)
  const PAGE_SIZE = 24;
  const startIdx = (pageNum - 1) * PAGE_SIZE;
  const pageBookmarks = bookmarks.slice(startIdx, startIdx + PAGE_SIZE);

  const itemList = pageBookmarks.map((bookmark, idx) => {
    const slug = generateUniqueSlug(bookmark.url, bookmarks, bookmark.id);
    return {
      url: ensureAbsoluteUrl(`/bookmarks/${slug}`),
      position: idx + 1,
    } as const;
  });

  const nowIso = new Date().toISOString();

  const jsonLdData = generateSchemaGraph({
    path: `/bookmarks/page/${pageNum}`,
    title: `${pageTitle} - Page ${pageNum}`,
    description: `${pageDescription} Page ${pageNum} of ${totalPages}.`,
    datePublished: nowIso,
    dateModified: nowIso,
    type: "bookmark-collection",
    itemList,
  });

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageTitle}
          description={pageDescription}
          initialPage={pageNum}
          includeImageData={false}
        />
      </div>
    </>
  );
}
