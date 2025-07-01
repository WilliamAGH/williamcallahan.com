/**
 * Paginated Tag Bookmarks Page
 * @module app/bookmarks/tags/[tagSlug]/page/[pageNumber]/page
 * @description
 * Displays paginated bookmarks for a specific tag with URL-based navigation
 * Implements proper SEO with canonical URLs and pagination metadata
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Disable persistent Data Cache – content is updated via revalidation logic in code (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";
// Revalidate every 30 minutes for fresh content
export const revalidate = 1800;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { sanitizeUnicode } from "@/lib/utils/tag-utils";
import type { PaginatedTagBookmarkContext } from "@/types";
import { PageNumberSchema } from "@/types/lib";

/**
 * Generate metadata for the paginated tag bookmarks page
 */
export async function generateMetadata({ params }: PaginatedTagBookmarkContext): Promise<Metadata> {
  const { pageNumber, tagSlug: rawTagSlug } = await Promise.resolve(params);

  // Validate page number
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(pageNumber);
  } catch {
    notFound();
  }

  const tagSlug = sanitizeUnicode(rawTagSlug);
  const { getTagBookmarksIndex } = await import("@/lib/bookmarks/bookmarks-data-access.server");
  const tagIndex = await getTagBookmarksIndex(tagSlug);
  const totalPages = tagIndex?.totalPages || 1;

  const displayTag = formatTagDisplay(tagSlug.replace(/-/g, " "));
  const path = `/bookmarks/tags/${tagSlug}`;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  const customTitle =
    pageNum === 1
      ? generateDynamicTitle(`${displayTag} Bookmarks`, "bookmarks", {
          isTag: true,
        })
      : generateDynamicTitle(`${displayTag} Bookmarks`, "bookmarks", {
          isTag: true,
          isPaginated: true,
          pageNumber: pageNum,
        });

  const baseDescription = generateTagDescription(displayTag, "bookmarks");
  const customDescription = pageNum === 1 ? baseDescription : `${baseDescription} Page ${pageNum} of ${totalPages}.`;

  const metadata: Metadata = {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    alternates: {
      canonical: pageNum === 1 ? ensureAbsoluteUrl(path) : ensureAbsoluteUrl(`${path}/page/${pageNum}`),
    },
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      url: pageNum === 1 ? ensureAbsoluteUrl(path) : ensureAbsoluteUrl(`${path}/page/${pageNum}`),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
    },
    robots: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  };

  // Build pagination link tags for SEO
  const paginationLinks: Array<{ rel: string; url: string }> = [];

  if (pageNum > 1) {
    paginationLinks.push({
      rel: "prev",
      url: pageNum === 2 ? ensureAbsoluteUrl(path) : ensureAbsoluteUrl(`${path}/page/${pageNum - 1}`),
    });
  }

  if (pageNum < totalPages) {
    paginationLinks.push({
      rel: "next",
      url: ensureAbsoluteUrl(`${path}/page/${pageNum + 1}`),
    });
  }

  if (paginationLinks.length > 0) {
    metadata.icons = {
      other: paginationLinks,
    };
  }

  return metadata;
}

export default async function PaginatedTagBookmarksPage({ params }: PaginatedTagBookmarkContext) {
  const { pageNumber, tagSlug: rawTagSlug } = await Promise.resolve(params);

  // Validate page number
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(pageNumber);
  } catch {
    notFound();
  }

  // Redirect page 1 to canonical tag URL
  if (pageNum === 1) {
    redirect(`/bookmarks/tags/${rawTagSlug}`);
  }

  const tagSlug = sanitizeUnicode(rawTagSlug);
  const { getTagBookmarksPage, getTagBookmarksIndex } = await import("@/lib/bookmarks/bookmarks-data-access.server");

  const tagIndex = await getTagBookmarksIndex(tagSlug);
  const taggedBookmarks = await getTagBookmarksPage(tagSlug, pageNum);
  const totalPages = tagIndex?.totalPages || 1;

  if (pageNum > totalPages) {
    notFound();
  }

  const displayTag = formatTagDisplay(tagSlug.replace(/-/g, " "));
  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = `${generateTagDescription(displayTag, "bookmarks")} Page ${pageNum} of ${totalPages}.`;

  // Generate schema for this paginated tagged bookmarks page
  const path = `/bookmarks/tags/${tagSlug}/page/${pageNum}`;
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
      { path: `/bookmarks/tags/${tagSlug}`, name: displayTag },
      { path, name: `Page ${pageNum}` },
    ],
  };
  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageTitle}
          description={pageDescription}
          bookmarks={taggedBookmarks}
          tag={displayTag}
          showFilterBar={true}
          titleSlug={tagSlug}
          initialPage={pageNum}
          baseUrl={`/bookmarks/tags/${tagSlug}`}
          initialTag={displayTag}
        />
      </div>
    </>
  );
}
