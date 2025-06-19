/**
 * Paginated Tag Bookmarks Page
 * @module app/bookmarks/tags/[tagSlug]/page/[pageNumber]/page
 * @description
 * Displays paginated bookmarks for a specific tag with URL-based navigation
 * Implements proper SEO with canonical URLs and pagination metadata
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Revalidate every 30 minutes for fresh content
export const revalidate = 1800;

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "@/components/seo/json-ld";
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { sanitizeUnicode } from "@/lib/utils/tag-utils";
import { z } from "zod";
import type { PaginatedTagBookmarkContext } from "@/types";

/**
 * Generate metadata for the paginated tag bookmarks page
 */
export async function generateMetadata({ params }: PaginatedTagBookmarkContext): Promise<Metadata> {
  const paramsResolved = await Promise.resolve(params);

  // Validate page number
  const PageParam = z.coerce.number().int().min(1);
  let pageNum: number;
  try {
    pageNum = PageParam.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Get all bookmarks to find the tag and calculate pagination
  const allBookmarks = await getBookmarksForStaticBuild();

  // Filter bookmarks by tag
  const taggedBookmarks = allBookmarks.filter((b) => {
    const names = (Array.isArray(b.tags) ? b.tags : []).map((t: string | import("@/types").BookmarkTag) =>
      typeof t === "string" ? t : t.name,
    );
    return names.some((n) => n.toLowerCase() === tagQuery.toLowerCase());
  });

  const totalPages = Math.ceil(taggedBookmarks.length / 24);

  // Find display name for the tag
  let displayTag = tagQuery
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  for (const bookmark of taggedBookmarks) {
    const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    for (const t of bookmarkTags) {
      const tagName = typeof t === "string" ? t : t.name;
      if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
        if (/[A-Z]/.test(tagName.slice(1))) {
          displayTag = tagName;
        }
        break;
      }
    }
  }

  const path = `/bookmarks/tags/${paramsResolved.tagSlug}`;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  const customTitle =
    pageNum === 1
      ? `${displayTag} Bookmarks | William Callahan`
      : `${displayTag} Bookmarks - Page ${pageNum} | William Callahan`;

  const customDescription =
    pageNum === 1
      ? `A collection of articles, websites, and resources I've saved about ${displayTag.toLowerCase()} for future reference.`
      : `A collection of articles, websites, and resources I've saved about ${displayTag.toLowerCase()} for future reference. Page ${pageNum} of ${totalPages}.`;

  const metadata: Metadata = {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    alternates: {
      canonical:
        pageNum === 1
          ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}`
          : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`,
    },
    openGraph: baseMetadata.openGraph
      ? {
          ...baseMetadata.openGraph,
          title: customTitle,
          description: customDescription,
          url:
            pageNum === 1
              ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}`
              : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`,
        }
      : undefined,
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
      url:
        pageNum === 2
          ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}`
          : `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum - 1}`,
    });
  }

  if (pageNum < totalPages) {
    paginationLinks.push({
      rel: "next",
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum + 1}`,
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
  const paramsResolved = await Promise.resolve(params);

  // Validate page number
  const PageParam = z.coerce.number().int().min(1);
  let pageNum: number;
  try {
    pageNum = PageParam.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Redirect page 1 to canonical tag URL
  if (pageNum === 1) {
    redirect(`/bookmarks/tags/${paramsResolved.tagSlug}`);
  }

  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Get all bookmarks and filter by tag
  const allBookmarks = await getBookmarksForStaticBuild();
  const taggedBookmarks = allBookmarks.filter((b) => {
    const names = (Array.isArray(b.tags) ? b.tags : []).map((t: string | import("@/types").BookmarkTag) =>
      typeof t === "string" ? t : t.name,
    );
    return names.some((n) => n.toLowerCase() === tagQuery.toLowerCase());
  });

  const totalPages = Math.ceil(taggedBookmarks.length / 24);

  if (pageNum > totalPages) {
    notFound();
  }

  // Find display name for the tag
  let displayTag = tagQuery;
  if (taggedBookmarks.length > 0) {
    for (const bookmark of taggedBookmarks) {
      const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      for (const t of bookmarkTags) {
        const tagName = typeof t === "string" ? t : t.name;
        if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
          if (/[A-Z]/.test(tagName.slice(1))) {
            displayTag = tagName;
          } else {
            displayTag = tagQuery
              .split(/[\s-]+/)
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");
          }
          break;
        }
      }
    }
  }

  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = `A collection of articles, websites, and resources I've saved about ${displayTag.toLowerCase()} for future reference. Page ${pageNum} of ${totalPages}.`;

  // JSON-LD data for paginated collection
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${pageTitle} - Page ${pageNum}`,
    description: pageDescription,
    url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`,
    isPartOf: {
      "@type": "Collection",
      name: pageTitle,
      url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com"}/bookmarks/tags/${paramsResolved.tagSlug}`,
    },
    position: pageNum,
  };

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageTitle}
          description={pageDescription}
          tag={displayTag} // Use server-side tag filtering instead of pre-filtered bookmarks
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
