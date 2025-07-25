/**
 * Bookmarks Tag Page
 *
 * Displays bookmarks tagged with a specific tag (first page).
 * Additional pages are handled by the paginated route.
 *
 * @module app/bookmarks/tags/[tagSlug]/page
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Revalidate every 30 minutes for fresh content
export const revalidate = 1800;
// Force dynamic rendering and disable Next.js Data Cache for heavy tag list pages (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";

import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { tagToSlug, sanitizeUnicode } from "@/lib/utils/tag-utils";
import type { BookmarkTagPageContext } from "@/types";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { redirect } from "next/navigation";

/**
 * Generate static paths for tag pages
 */
export async function generateStaticParams() {
  const bookmarks = getBookmarksForStaticBuild();
  const tagCounts: { [key: string]: number } = {};
  bookmarks.forEach((b) => {
    (Array.isArray(b.tags) ? b.tags : []).forEach((t: string | { name: string }) => {
      const tagName = typeof t === "string" ? t : t.name;
      const slug = tagToSlug(tagName);
      if (!tagCounts[slug]) {
        tagCounts[slug] = 0;
      }
      tagCounts[slug]++;
    });
  });

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const params: { slug: string[] }[] = [];

  for (const tagSlug in tagCounts) {
    const { totalPages } = await getBookmarksByTag(tagSlug, 1);
    params.push({ slug: [tagSlug] });
    for (let i = 2; i <= totalPages; i++) {
      params.push({ slug: [tagSlug, "page", i.toString()] });
    }
  }

  return params;
}

/**
 * Generate metadata for this tag page
 */
export async function generateMetadata({ params }: BookmarkTagPageContext): Promise<Metadata> {
  const { slug } = params;
  const [tagSlug, page, pageNumberStr] = slug;

  if (!tagSlug) {
    return getStaticPageMetadata("/bookmarks", "bookmarks");
  }

  const pageNumber = page === "page" && pageNumberStr ? parseInt(pageNumberStr, 10) : 1;

  const decodedSlug = decodeURIComponent(tagSlug);
  const normalizedSlug = tagToSlug(decodedSlug);
  const sanitizedSlug = sanitizeUnicode(normalizedSlug);

  let path = `/bookmarks/tags/${sanitizedSlug}`;
  if (pageNumber > 1) {
    path += `/page/${pageNumber}`;
  }

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const { bookmarks } = await getBookmarksByTag(sanitizedSlug, pageNumber);

  if (bookmarks.length === 0) {
    return {
      ...getStaticPageMetadata(path, "bookmarks"),
      title: "No Bookmarks Found For This Tag",
    };
  }

  const displayTag = formatTagDisplay(sanitizedSlug.replace(/-/g, " "));
  const pageTitle = pageNumber > 1 ? `${displayTag} Bookmarks (Page ${pageNumber})` : `${displayTag} Bookmarks`;

  const customTitle = generateDynamicTitle(pageTitle, "bookmarks", {
    isTag: true,
  });
  const customDescription = generateTagDescription(
    displayTag,
    "bookmarks",
    pageNumber > 1 ? pageNumber.toString() : undefined,
  );
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      url: ensureAbsoluteUrl(path),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function TagPage({ params }: BookmarkTagPageContext) {
  const { slug = [] } = params;

  if (!slug || slug.length === 0) {
    redirect("/bookmarks");
  }

  const [rawTagSlug, page, pageNumberStr] = slug;
  const currentPage = page === "page" && pageNumberStr ? parseInt(pageNumberStr, 10) : 1;

  if (!rawTagSlug) {
    redirect("/bookmarks");
  }

  const decodedSlug = decodeURIComponent(rawTagSlug);
  const normalizedSlug = tagToSlug(decodedSlug);
  const sanitizedSlug = sanitizeUnicode(normalizedSlug);

  if (sanitizedSlug !== rawTagSlug || (page && page !== "page")) {
    let redirectPath = `/bookmarks/tags/${sanitizedSlug}`;
    if (currentPage > 1) {
      redirectPath += `/page/${currentPage}`;
    }
    redirect(redirectPath);
  }

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const result = await getBookmarksByTag(sanitizedSlug, currentPage);

  if (!result.bookmarks || result.bookmarks.length === 0) {
    redirect("/bookmarks");
  }

  const tagDisplayName =
    result.bookmarks[0]?.tags.find((t) => typeof t !== "string" && tagToSlug(t.name) === sanitizedSlug) ??
    sanitizedSlug;

  const finalTagDisplayName = typeof tagDisplayName === "string" ? tagDisplayName : tagDisplayName.name;
  const displayTag = formatTagDisplay(finalTagDisplayName.replace(/-/g, " "));

  const pageTitle =
    currentPage > 1 ? `Bookmarks for ${displayTag} (Page ${currentPage})` : `Bookmarks for ${displayTag}`;

  const pageDescription = generateTagDescription(
    displayTag,
    "bookmarks",
    currentPage > 1 ? currentPage.toString() : undefined,
  );

  // Generate schema for this tagged bookmarks page
  let path = `/bookmarks/tags/${sanitizedSlug}`;
  if (currentPage > 1) {
    path += `/page/${currentPage}`;
  }
  const pageMetadata = PAGE_METADATA.bookmarks;
  const breadcrumbs = [
    { path: "/", name: "Home" },
    { path: "/bookmarks", name: "Bookmarks" },
    { path: `/bookmarks/tags/${sanitizedSlug}`, name: displayTag },
  ];
  if (currentPage > 1) {
    breadcrumbs.push({ path, name: `Page ${currentPage}` });
  }

  const schemaParams = {
    path,
    title: pageTitle,
    description: pageDescription,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "collection" as const,
    breadcrumbs,
  };
  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <div className="space-y-8">
          <BookmarksServer
            title={`Bookmarks tagged with "${finalTagDisplayName}"`}
            description={`A collection of bookmarks filtered by the tag "${finalTagDisplayName}".`}
            bookmarks={convertBookmarksToSerializable(result.bookmarks)}
            usePagination={true}
            initialPage={currentPage}
            totalPages={result.totalPages}
            totalCount={result.totalCount}
            baseUrl={`/bookmarks/tags/${sanitizedSlug}`}
            initialTag={finalTagDisplayName}
            tag={finalTagDisplayName}
          />
        </div>
      </div>
    </>
  );
}
