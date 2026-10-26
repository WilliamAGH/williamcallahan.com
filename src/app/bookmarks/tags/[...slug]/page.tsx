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
import { BookmarkTopicHubOverview } from "@/components/features/bookmarks/bookmark-topic-hub-overview";
import { RelatedContent } from "@/components/features/related-content/related-content.server";
import { RelatedContentFallback } from "@/components/features/related-content/related-content-section";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { SEARCH_EXCLUDED_ROBOTS } from "@/lib/seo/search-exclusion";
import {
  MIN_TAG_HUB_BOOKMARKS,
  evaluateTagHubIndexability,
  buildGraduatedTagHubDescription,
} from "@/lib/seo/bookmark-seo-policy";
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
import type { BookmarkTagPageContext } from "@/types/api";
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { redirect, notFound } from "next/navigation";
import { resolveBookmarkTagSlug } from "@/lib/bookmarks/service.server";
import { cacheContextGuards } from "@/lib/cache";
import type { BookmarkTopicHubEvidence } from "@/types/schemas/bookmark-seo";

const TOPIC_HUB_CACHE_SECONDS = 3600;
const FIRST_TAG_PAGE = 1;
const NON_FIRST_TAG_PAGE = 2;

async function loadCachedTopicHubEvidence(
  canonicalSlug: string,
): Promise<BookmarkTopicHubEvidence | null> {
  "use cache";
  cacheContextGuards.cacheLife("BookmarkTopicHub", { revalidate: TOPIC_HUB_CACHE_SECONDS });
  cacheContextGuards.cacheTag("BookmarkTopicHub", "bookmarks", `bookmark-tag-${canonicalSlug}`);
  const { getBookmarkTopicHubEvidence } = await import("@/lib/db/queries/bookmark-seo");
  return getBookmarkTopicHubEvidence(canonicalSlug);
}

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

function decodeTagSlug(rawTagSlug: string): string {
  try {
    return decodeURIComponent(rawTagSlug);
  } catch (error) {
    console.warn(`[TagPage] Failed to decode tag slug "${rawTagSlug}"`, error);
    return rawTagSlug;
  }
}

function buildCanonicalTagPath(tagSlug: string, pageNumber: number): string {
  let path = `/bookmarks/tags/${tagSlug}`;
  if (pageNumber > 1) {
    path += `/page/${pageNumber}`;
  }
  return path;
}

async function resolveTagSlugState(rawTagSlug: string): Promise<{
  sanitizedSlug: string;
  canonicalSlug: string;
  canonicalTagName: string | null;
  isAlias: boolean;
}> {
  const sanitizedSlug = tagToSlug(decodeTagSlug(rawTagSlug));
  const resolution = await resolveBookmarkTagSlug(sanitizedSlug);
  const canonicalSlug = resolution.canonicalSlug || sanitizedSlug;
  return {
    sanitizedSlug,
    canonicalSlug,
    canonicalTagName: resolution.canonicalTagName,
    isAlias: resolution.isAlias && canonicalSlug !== sanitizedSlug,
  };
}

/**
 * Generate metadata for this tag page
 */
export async function generateMetadata({ params }: BookmarkTagPageContext): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const [tagSlug, page, pageNumberStr] = slug;

  if (!tagSlug) {
    return { ...getStaticPageMetadata("/bookmarks", "bookmarks"), robots: SEARCH_EXCLUDED_ROBOTS };
  }

  const pageNumber = parsePageParam(page, pageNumberStr);
  const tagState = await resolveTagSlugState(tagSlug);
  if (!tagState.canonicalTagName) {
    return { ...getStaticPageMetadata("/bookmarks", "bookmarks"), robots: SEARCH_EXCLUDED_ROBOTS };
  }
  const activeTagSlug = tagState.canonicalSlug;

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const { bookmarks, totalCount, totalPages } = await getBookmarksByTag(activeTagSlug, pageNumber);

  // Determine canonical page for metadata
  // If there are zero pages for this tag, canonicalize to page 1 (base tag path)
  const effectivePage =
    totalPages === 0 ? FIRST_TAG_PAGE : pageNumber > totalPages ? totalPages : pageNumber;

  let path = `/bookmarks/tags/${activeTagSlug}`;
  if (effectivePage > 1) {
    path += `/page/${effectivePage}`;
  }

  // If the tag has zero bookmarks in total, return the empty-state metadata
  if (bookmarks.length === 0 && totalPages === 0) {
    return {
      ...getStaticPageMetadata(path, "bookmarks"),
      title: "No Bookmarks Found For This Tag",
      robots: SEARCH_EXCLUDED_ROBOTS,
    };
  }

  const effectivePolicyPage = page ? Math.max(pageNumber, NON_FIRST_TAG_PAGE) : effectivePage;
  const isNonCanonicalRequest = tagState.isAlias || tagState.sanitizedSlug !== tagSlug;
  const isCandidateHub =
    !isNonCanonicalRequest &&
    effectivePolicyPage === FIRST_TAG_PAGE &&
    totalCount >= MIN_TAG_HUB_BOOKMARKS;
  const candidateEvidence = isCandidateHub ? await loadCachedTopicHubEvidence(activeTagSlug) : null;
  const eligibleHubCount = candidateEvidence?.totalCount ?? 0;
  const hubVerdict = evaluateTagHubIndexability({
    totalCount: isCandidateHub ? eligibleHubCount : 0,
    pageNumber: effectivePolicyPage,
    isAlias: isNonCanonicalRequest,
  });
  const hubEvidence = hubVerdict.indexable ? candidateEvidence : null;

  const displayTag = formatTagDisplay(
    tagState.canonicalTagName?.trim() || activeTagSlug.replace(/-/g, " "),
  );
  const pageTitle = hubVerdict.indexable
    ? `${displayTag}: Curated Engineering & AI Resources`
    : effectivePage > FIRST_TAG_PAGE
      ? `${displayTag} Bookmarks (Page ${effectivePage})`
      : `${displayTag} Bookmarks`;

  const customTitle = generateDynamicTitle(pageTitle, "bookmarks", {
    isTag: true,
  });
  const baseDescription = generateTagDescription(displayTag, "bookmarks");
  const customDescription = hubVerdict.indexable
    ? buildGraduatedTagHubDescription({
        displayTag,
        totalCount: eligibleHubCount,
        annotatedCount: hubEvidence?.annotatedCount,
        topDomains: hubEvidence?.topDomains,
      })
    : effectivePage > FIRST_TAG_PAGE
      ? `${baseDescription} — Page ${effectivePage}.`
      : baseDescription;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  const ogImageUrl = buildOgImageUrl("collection", {
    title: pageTitle,
    section: "bookmarks",
    subtitle: hubVerdict.indexable
      ? `${eligibleHubCount} curated resources`
      : `${bookmarks.length} bookmark${bookmarks.length === 1 ? "" : "s"}`,
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
    robots: hubVerdict.robots,
  };
}

export default async function TagPage({ params }: BookmarkTagPageContext) {
  const { slug } = await Promise.resolve(params);

  if (!slug || slug.length === 0) {
    redirect("/bookmarks");
  }

  const [rawTagSlug, page, pageNumberStr] = slug;
  const currentPage = parsePageParam(page, pageNumberStr);

  if (!rawTagSlug) {
    redirect("/bookmarks");
  }

  const tagState = await resolveTagSlugState(rawTagSlug);
  if (!tagState.canonicalTagName) {
    redirect("/bookmarks");
  }
  const activeTagSlug = tagState.canonicalSlug;

  // Canonicalize legacy numeric-only page segment to /page/[n]
  const isNumericPageSegment = page && /^\d+$/.test(page);
  if (
    tagState.sanitizedSlug !== rawTagSlug ||
    (page && page !== "page" && !isNumericPageSegment) ||
    tagState.isAlias
  ) {
    redirect(buildCanonicalTagPath(activeTagSlug, currentPage));
  }

  // Redirect legacy numeric form /bookmarks/tags/[slug]/[n] to canonical /bookmarks/tags/[slug]/page/[n]
  if (isNumericPageSegment) {
    redirect(buildCanonicalTagPath(activeTagSlug, currentPage));
  }

  // Redirect /page/1 to base tag path
  if (page === "page" && currentPage === 1) {
    redirect(`/bookmarks/tags/${activeTagSlug}`);
  }

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const result = await getBookmarksByTag(activeTagSlug, currentPage);

  // If the requested page exceeds the total available pages, redirect to the last page
  if (result.totalPages > 0 && currentPage > result.totalPages) {
    let redirectPath = `/bookmarks/tags/${activeTagSlug}`;
    if (result.totalPages > 1) {
      redirectPath += `/page/${result.totalPages}`;
    }
    redirect(redirectPath);
  }

  // If there are zero pages for this tag and a paginated route was requested, redirect to the base tag path
  if (result.totalPages === 0 && currentPage > 1) {
    redirect(`/bookmarks/tags/${activeTagSlug}`);
  }

  if (!result.bookmarks || result.bookmarks.length === 0) {
    notFound();
  }

  const isCandidateHub =
    currentPage === FIRST_TAG_PAGE && result.totalCount >= MIN_TAG_HUB_BOOKMARKS;
  const candidateEvidence = isCandidateHub ? await loadCachedTopicHubEvidence(activeTagSlug) : null;
  const hubVerdict = evaluateTagHubIndexability({
    totalCount: isCandidateHub ? (candidateEvidence?.totalCount ?? 0) : 0,
    pageNumber: currentPage,
    isAlias: false,
  });
  const hubEvidence = hubVerdict.indexable ? candidateEvidence : null;

  const canonicalTag =
    result.bookmarks[0]?.tags.find(
      (t) => (typeof t === "string" ? tagToSlug(t) : tagToSlug(t.name)) === activeTagSlug,
    ) ?? null;

  const canonicalTagName =
    typeof canonicalTag === "string" ? canonicalTag : canonicalTag ? canonicalTag.name : null;

  // Use canonical name if found, otherwise convert slug back to spaced form for display.
  const finalTagDisplayName =
    tagState.canonicalTagName?.trim() || canonicalTagName || activeTagSlug.replace(/-/g, " ");
  // formatTagDisplay handles casing; don't replace hyphens again as canonical names may contain them (e.g., "C-suite")
  const displayTag = formatTagDisplay(finalTagDisplayName);

  const pageTitle =
    currentPage > 1
      ? `Bookmarks for ${displayTag} (Page ${currentPage})`
      : `Bookmarks for ${displayTag}`;

  const pageBaseDescription = generateTagDescription(displayTag, "bookmarks");
  const pageDescription =
    hubVerdict.indexable && hubEvidence
      ? buildGraduatedTagHubDescription({
          displayTag,
          totalCount: hubEvidence.totalCount,
          annotatedCount: hubEvidence.annotatedCount,
          topDomains: hubEvidence.topDomains,
        })
      : currentPage > FIRST_TAG_PAGE
        ? `${pageBaseDescription} — Page ${currentPage}.`
        : pageBaseDescription;

  // Generate schema for this tagged bookmarks page
  let path = `/bookmarks/tags/${activeTagSlug}`;
  if (currentPage > 1) {
    path += `/page/${currentPage}`;
  }
  const pageMetadata = PAGE_METADATA.bookmarks;
  const breadcrumbs = [
    { path: "/", name: "Home" },
    { path: "/bookmarks", name: "Bookmarks" },
    { path: `/bookmarks/tags/${activeTagSlug}`, name: displayTag },
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
    itemList: result.bookmarks.map((bookmark, index) => ({
      url: buildBookmarkPath(bookmark.slug),
      position: index + 1,
    })),
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
            baseUrl={`/bookmarks/tags/${activeTagSlug}`}
            initialTag={finalTagDisplayName}
            tag={finalTagDisplayName}
          />
          {hubEvidence && (
            <BookmarkTopicHubOverview displayTag={displayTag} evidence={hubEvidence} />
          )}
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
