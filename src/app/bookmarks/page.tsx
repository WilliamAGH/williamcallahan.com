/**
 * Bookmarks Page
 * @module app/bookmarks/page
 * @description
 * Displays curated collection of bookmarked resources
 * Implements proper SEO with schema.org structured data
 *
 * @see {@link "https://nextjs.org/docs/app/api-reference/functions/generate-metadata"} - Next.js Metadata API
 * @see {@link "https://schema.org/CollectionPage"} - Schema.org CollectionPage specification
 */

import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { DiscoverFeed } from "@/components/features/bookmarks/discover-feed.client";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { getDiscoveryGroupedBookmarks } from "@/lib/db/queries/discovery-grouped";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import type { DiscoverFeedContent } from "@/types/features/discovery";

const INITIAL_DISCOVER_SECTIONS_PER_PAGE = 2;

/**
 * Generate metadata for the Bookmarks page
 */
export function generateMetadata(): Metadata {
  return getStaticPageMetadata("/bookmarks", "bookmarks");
}

/**
 * Runtime policy
 * cacheComponents disallows route-level `dynamic` flags (see https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents);
 * freshness comes from the bookmark data fetches that opt into `no-store` semantics instead of build-time snapshots.
 */

export default async function BookmarksPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const params = await searchParams;
  const tagParam = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const feedMode = params.feed === "latest" ? "latest" : "discover";
  const hasTagFilter = Boolean(tagParam && tagParam.trim().length > 0);
  const initialTag = hasTagFilter ? tagParam?.trim() : undefined;

  const pageMetadata = PAGE_METADATA.bookmarks;

  // Generate JSON-LD schema for the bookmarks page
  const formattedCreated = formatSeoDate(pageMetadata.dateCreated);
  const formattedModified = formatSeoDate(pageMetadata.dateModified);

  const schemaParams = {
    path: "/bookmarks",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formattedCreated,
    dateModified: formattedModified,
    type: "collection" as const,
    image: {
      url: getStaticImageUrl("/images/og/bookmarks-og.png"),
      width: 2100,
      height: 1100,
    },
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/bookmarks", name: "Bookmarks" },
    ],
  };

  const jsonLdData = generateSchemaGraph(schemaParams);

  if (feedMode === "discover" && !hasTagFilter) {
    let discoverData: DiscoverFeedContent;
    try {
      discoverData = await getDiscoveryGroupedBookmarks({
        sectionPage: 1,
        sectionsPerPage: INITIAL_DISCOVER_SECTIONS_PER_PAGE,
      });
    } catch (error) {
      console.error(
        "[BookmarksPage] Discover feed failed. Rendering explicit degraded mode.",
        error,
      );
      discoverData = {
        recentlyAdded: [],
        topicSections: [],
        internalHrefs: {},
        pagination: {
          sectionPage: 1,
          sectionsPerPage: 4,
          totalSections: 0,
          hasNextSectionPage: false,
          nextSectionPage: null,
        },
        degradation: {
          isDegraded: true,
          reasons: ["Discover feed is temporarily unavailable. Please retry or use latest feed."],
        },
      };
    }
    return (
      <>
        <JsonLdScript data={jsonLdData} />
        <DiscoverFeed data={discoverData} />
      </>
    );
  }

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageMetadata.title}
          description={pageMetadata.description}
          initialPage={1}
          includeImageData={true}
          initialTag={initialTag}
          tag={initialTag}
          feedMode={feedMode === "latest" || hasTagFilter ? "latest" : undefined}
        />
      </div>
    </>
  );
}
