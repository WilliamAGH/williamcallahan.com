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
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { sanitizeUnicode } from "@/lib/utils/tag-utils";
import type { PaginatedTagBookmarkContext } from "@/types";
import { PageNumberSchema } from "@/types/lib";

/**
 * Generate metadata for the paginated tag bookmarks page
 */
export async function generateMetadata({ params }: PaginatedTagBookmarkContext): Promise<Metadata> {
  const paramsResolved = await Promise.resolve(params);

  // Validate page number
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Try to get tag index from S3 for pagination metadata
  const { getTagBookmarksIndex, getBookmarks: getBookmarksFromService } = await import(
    "@/lib/bookmarks/bookmarks-data-access.server"
  );
  const tagIndex = await getTagBookmarksIndex(tagSlug);

  let totalPages: number;
  let taggedBookmarks: import("@/types").UnifiedBookmark[];

  if (tagIndex) {
    // Use S3 cached metadata
    totalPages = tagIndex.totalPages;
    taggedBookmarks = []; // We only need a sample for display tag extraction
  } else {
    // Fall back to filtering all bookmarks (lightweight data)
    const allBookmarks = (await getBookmarksFromService({
      includeImageData: false,
    })) as import("@/types").UnifiedBookmark[];
    taggedBookmarks = allBookmarks.filter((b) => {
      const names = (Array.isArray(b.tags) ? b.tags : []).map((t: string | import("@/types").BookmarkTag) =>
        typeof t === "string" ? t : t.name,
      );
      return names.some((n) => n.toLowerCase() === tagQuery.toLowerCase());
    });
    totalPages = Math.ceil(taggedBookmarks.length / 24);
  }

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
      ? generateDynamicTitle(`${displayTag} Bookmarks`, "bookmarks", { isTag: true })
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
      canonical:
        pageNum === 1
          ? ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}`)
          : ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`),
    },
    openGraph: baseMetadata.openGraph
      ? {
          ...baseMetadata.openGraph,
          title: customTitle,
          description: customDescription,
          url:
            pageNum === 1
              ? ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}`)
              : ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`),
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
          ? ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}`)
          : ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum - 1}`),
    });
  }

  if (pageNum < totalPages) {
    paginationLinks.push({
      rel: "next",
      url: ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum + 1}`),
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
  let pageNum: number;
  try {
    pageNum = PageNumberSchema.parse(paramsResolved.pageNumber);
  } catch {
    notFound();
  }

  // Redirect page 1 to canonical tag URL
  if (pageNum === 1) {
    redirect(`/bookmarks/tags/${paramsResolved.tagSlug}`);
  }

  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Try to load from S3 first for better performance
  const { getTagBookmarksPage, getTagBookmarksIndex } = await import("@/lib/bookmarks/bookmarks-data-access.server");

  // Get tag index for total pages
  const tagIndex = await getTagBookmarksIndex(tagSlug);
  const tagBookmarksFromS3 = await getTagBookmarksPage(tagSlug, pageNum);

  let taggedBookmarks: import("@/types").UnifiedBookmark[];
  let totalPages: number;

  if (tagBookmarksFromS3.length > 0 && tagIndex) {
    // Use S3 cached data if available
    taggedBookmarks = tagBookmarksFromS3;
    totalPages = tagIndex.totalPages;
  } else {
    // Fall back to filtering all bookmarks
    const allBookmarks = await getBookmarks();
    taggedBookmarks = allBookmarks.filter((b) => {
      const names = (Array.isArray(b.tags) ? b.tags : []).map((t: string | import("@/types").BookmarkTag) =>
        typeof t === "string" ? t : t.name,
      );
      return names.some((n) => n.toLowerCase() === tagQuery.toLowerCase());
    });
    totalPages = Math.ceil(taggedBookmarks.length / 24);
  }

  if (pageNum > totalPages) {
    notFound();
  }

  // Find display name for the tag
  let displayTag = formatTagDisplay(tagQuery);
  if (taggedBookmarks.length > 0) {
    for (const bookmark of taggedBookmarks) {
      const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      for (const t of bookmarkTags) {
        const tagName = typeof t === "string" ? t : t.name;
        if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
          displayTag = formatTagDisplay(tagName);
          break;
        }
      }
    }
  }

  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = `${generateTagDescription(displayTag, "bookmarks")} Page ${pageNum} of ${totalPages}.`;

  // Build itemList using pre-filtered taggedBookmarks slice for this page
  const PAGE_SIZE = 24;
  const startIdx = (pageNum - 1) * PAGE_SIZE;
  const pageBookmarks = taggedBookmarks.slice(startIdx, startIdx + PAGE_SIZE);

  const itemList = pageBookmarks.map((bookmark, idx) => {
    const slug = generateUniqueSlug(bookmark.url, pageBookmarks, bookmark.id);
    return {
      url: ensureAbsoluteUrl(`/bookmarks/${slug}`),
      position: idx + 1,
    } as const;
  });

  const nowIso = new Date().toISOString();

  const jsonLdData = generateSchemaGraph({
    path: `/bookmarks/tags/${paramsResolved.tagSlug}/page/${pageNum}`,
    title: `${pageTitle} - Page ${pageNum}`,
    description: pageDescription,
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
          bookmarks={taggedBookmarks} // Pass the pre-filtered bookmarks
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
