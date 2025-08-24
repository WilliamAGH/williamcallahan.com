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
// Force dynamic rendering and disable Next.js Data Cache for heavy tag list pages (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";

import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getBookmarksForStaticBuildAsync } from "@/lib/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate, ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { BookmarkTagPageContext } from "@/types";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { redirect, notFound } from "next/navigation";
import { BOOKMARKS_PER_PAGE } from "@/lib/constants";

/**
 * Generate static paths for tag pages at build time
 *
 * FIX (Issue #sitemap-2024): Changed from sync getBookmarksForStaticBuild() to async version.
 * Sync function always returned empty array, causing tag URLs to be missing from sitemap.
 * Blog tags worked because getAllPosts() reads from local filesystem synchronously.
 *
 * IMPORTANT: Filtering Consistency Requirement
 * getBookmarksForStaticBuildAsync() filters out bookmarks without id/slug fields,
 * while getBookmarksByTag() at runtime includes ALL bookmarks. This ensures we only
 * generate static paths for bookmarks that can actually be rendered (those with slugs).
 * If bookmarks without id/slug exist, runtime will show fewer items per page than expected,
 * but this is preferable to generating paths for bookmarks that cannot be displayed.
 *
 * @see lib/bookmarks/bookmarks.server.ts for why sync vs async matters
 */
export async function generateStaticParams() {
  const bookmarks = await getBookmarksForStaticBuildAsync();
  const tagCounts: { [key: string]: number } = {};
  bookmarks.forEach(b => {
    (Array.isArray(b.tags) ? b.tags : []).forEach((t: string | { name: string }) => {
      const tagName = typeof t === "string" ? t : t.name;
      const slug = tagToSlug(tagName);
      if (!tagCounts[slug]) {
        tagCounts[slug] = 0;
      }
      tagCounts[slug]++;
    });
  });

  const params: { slug: string[] }[] = [];

  for (const tagSlug in tagCounts) {
    // Calculate totalPages based on bookmarks that have valid id/slug fields
    // This matches the filtering in getBookmarksForStaticBuildAsync()
    const count = tagCounts[tagSlug] || 0;
    const totalPages = Math.ceil(count / BOOKMARKS_PER_PAGE);
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

  // Support both /tags/[slug]/page/[n] and legacy /tags/[slug]/[n]
  const parsedPage =
    page === "page" && pageNumberStr
      ? Number.parseInt(pageNumberStr, 10)
      : page && /^\d+$/.test(page)
        ? Number.parseInt(page, 10)
        : 1;
  const pageNumber = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(tagSlug);
  } catch {
    decodedSlug = tagSlug;
  }
  const sanitizedSlug = tagToSlug(decodedSlug);

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const { bookmarks, totalPages } = await getBookmarksByTag(sanitizedSlug, pageNumber);

  // Determine canonical page for metadata
  // If there are zero pages for this tag, canonicalize to page 1 (base tag path)
  const effectivePage = totalPages === 0 ? 1 : pageNumber > totalPages ? totalPages : pageNumber;

  let path = `/bookmarks/tags/${sanitizedSlug}`;
  if (effectivePage > 1) {
    path += `/page/${effectivePage}`;
  }

  // If the tag has zero bookmarks in total, return the empty-state metadata
  if (bookmarks.length === 0 && totalPages === 0) {
    return {
      ...getStaticPageMetadata(path, "bookmarks"),
      title: "No Bookmarks Found For This Tag",
    };
  }

  const displayTag = formatTagDisplay(sanitizedSlug.replace(/-/g, " "));
  const pageTitle = effectivePage > 1 ? `${displayTag} Bookmarks (Page ${effectivePage})` : `${displayTag} Bookmarks`;

  const customTitle = generateDynamicTitle(pageTitle, "bookmarks", {
    isTag: true,
  });
  const customDescription = generateTagDescription(
    displayTag,
    "bookmarks",
    effectivePage > 1 ? effectivePage.toString() : undefined,
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
  // Support both /tags/[slug]/page/[n] and legacy /tags/[slug]/[n]
  const parsedCurrent =
    page === "page" && pageNumberStr
      ? Number.parseInt(pageNumberStr, 10)
      : page && /^\d+$/.test(page)
        ? Number.parseInt(page, 10)
        : 1;
  const currentPage = Number.isNaN(parsedCurrent) || parsedCurrent < 1 ? 1 : parsedCurrent;

  if (!rawTagSlug) {
    redirect("/bookmarks");
  }

  let decodedSlug: string;
  try {
    decodedSlug = decodeURIComponent(rawTagSlug);
  } catch {
    decodedSlug = rawTagSlug;
  }
  const sanitizedSlug = tagToSlug(decodedSlug);

  // Canonicalize legacy numeric-only page segment to /page/[n]
  const isLegacyNumeric = page && /^\d+$/.test(page);
  if (sanitizedSlug !== rawTagSlug || (page && page !== "page" && !isLegacyNumeric)) {
    let redirectPath = `/bookmarks/tags/${sanitizedSlug}`;
    if (currentPage > 1) {
      redirectPath += `/page/${currentPage}`;
    }
    redirect(redirectPath);
  }

  // Redirect legacy numeric form /bookmarks/tags/[slug]/[n] to canonical /bookmarks/tags/[slug]/page/[n]
  if (isLegacyNumeric) {
    let redirectPath = `/bookmarks/tags/${sanitizedSlug}`;
    if (currentPage > 1) {
      redirectPath += `/page/${currentPage}`;
    }
    redirect(redirectPath);
  }

  // Redirect /page/1 to base tag path
  if (page === "page" && currentPage === 1) {
    redirect(`/bookmarks/tags/${sanitizedSlug}`);
  }

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const result = await getBookmarksByTag(sanitizedSlug, currentPage);

  // If the requested page exceeds the total available pages, redirect to the last page
  if (result.totalPages > 0 && currentPage > result.totalPages) {
    let redirectPath = `/bookmarks/tags/${sanitizedSlug}`;
    if (result.totalPages > 1) {
      redirectPath += `/page/${result.totalPages}`;
    }
    redirect(redirectPath);
  }

  // If there are zero pages for this tag and a paginated route was requested, redirect to the base tag path
  if (result.totalPages === 0 && currentPage > 1) {
    redirect(`/bookmarks/tags/${sanitizedSlug}`);
  }

  if (!result.bookmarks || result.bookmarks.length === 0) {
    notFound();
  }

  const tagDisplayName =
    result.bookmarks[0]?.tags.find(t => typeof t !== "string" && tagToSlug(t.name) === sanitizedSlug) ?? sanitizedSlug;

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
