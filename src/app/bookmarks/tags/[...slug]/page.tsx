/**
 * Bookmarks Tag Page
 *
 * Displays bookmarks tagged with a specific tag (first page).
 * Additional pages are handled by the paginated route.
 *
 * @module app/bookmarks/tags/[tagSlug]/page
 */

import type { Metadata } from "next";
import { Suspense } from "react";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { RelatedContent } from "@/components/features/related-content/related-content.server";
import { RelatedContentFallback } from "@/components/features/related-content/related-content-section";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import { buildOgImageUrl } from "@/lib/og-image/build-og-url";
import { formatSeoDate } from "@/lib/seo/utils";
import {
  generateDynamicTitle,
  generateTagDescription,
  formatTagDisplay,
} from "@/lib/seo/dynamic-metadata";
import { tagToSlug } from "@/lib/utils/tag-utils";
import type { BookmarkTagPageContext } from "@/types";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { redirect, notFound } from "next/navigation";

/**
 * Parse page number from URL segments
 * Supports both /tags/[slug]/page/[n] and legacy /tags/[slug]/[n] formats
 */
function parsePageParam(page: string | undefined, pageNumberStr: string | undefined): number {
  const parsed =
    page === "page" && pageNumberStr
      ? Number.parseInt(pageNumberStr, 10)
      : page && /^\d+$/.test(page)
        ? Number.parseInt(page, 10)
        : 1;
  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;
}

/**
 * Generate metadata for this tag page
 */
export async function generateMetadata({ params }: BookmarkTagPageContext): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const [tagSlug, page, pageNumberStr] = slug;

  if (!tagSlug) {
    return getStaticPageMetadata("/bookmarks", "bookmarks");
  }

  const pageNumber = parsePageParam(page, pageNumberStr);

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
  const pageTitle =
    effectivePage > 1
      ? `${displayTag} Bookmarks (Page ${effectivePage})`
      : `${displayTag} Bookmarks`;

  const customTitle = generateDynamicTitle(pageTitle, "bookmarks", {
    isTag: true,
  });
  const baseDescription = generateTagDescription(displayTag, "bookmarks");
  const customDescription =
    effectivePage > 1 ? `${baseDescription} — Page ${effectivePage}.` : baseDescription;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  const ogImageUrl = buildOgImageUrl("collection", {
    title: pageTitle,
    section: "bookmarks",
    subtitle: `${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}`,
  });
  const ogImage = { url: ogImageUrl, width: 1200, height: 630, alt: customTitle };

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      url: ensureAbsoluteUrl(path),
      images: [ogImage],
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      images: [ogImage],
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function TagPage({ params }: BookmarkTagPageContext) {
  const { slug = [] } = await Promise.resolve(params);

  if (!slug || slug.length === 0) {
    redirect("/bookmarks");
  }

  const [rawTagSlug, page, pageNumberStr] = slug;
  const currentPage = parsePageParam(page, pageNumberStr);

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

  const canonicalTag =
    result.bookmarks[0]?.tags.find(
      (t) => (typeof t === "string" ? tagToSlug(t) : tagToSlug(t.name)) === sanitizedSlug,
    ) ?? null;

  const canonicalTagName =
    typeof canonicalTag === "string" ? canonicalTag : canonicalTag ? canonicalTag.name : null;

  // Use canonical name if found, otherwise convert slug back to spaced form for display.
  const finalTagDisplayName = canonicalTagName ?? sanitizedSlug.replace(/-/g, " ");
  // formatTagDisplay handles casing; don't replace hyphens again as canonical names may contain them (e.g., "C-suite")
  const displayTag = formatTagDisplay(finalTagDisplayName);

  const pageTitle =
    currentPage > 1
      ? `Bookmarks for ${displayTag} (Page ${currentPage})`
      : `Bookmarks for ${displayTag}`;

  const pageBaseDescription = generateTagDescription(displayTag, "bookmarks");
  const pageDescription =
    currentPage > 1 ? `${pageBaseDescription} — Page ${currentPage}.` : pageBaseDescription;

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

  // Get first bookmark ID for related content source
  const firstBookmark = result.bookmarks[0];

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
          {firstBookmark && (
            <Suspense fallback={<RelatedContentFallback />}>
              <RelatedContent
                sourceType="bookmark"
                sourceId={firstBookmark.id}
                sectionTitle="Discover More"
                options={{
                  maxPerType: 3,
                  maxTotal: 12,
                  excludeTags: canonicalTagName ? [canonicalTagName] : [],
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
}
