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
import { Suspense } from "react";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import {
  DiscoverFeedWrapper,
  DiscoverFeedSkeleton,
} from "@/components/features/bookmarks/discover-feed-wrapper.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

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

async function BookmarksContent({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const params = await searchParams;
  const tagParam = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const feedMode = params.feed === "latest" ? "latest" : "discover";
  const hasTagFilter = Boolean(tagParam && tagParam.trim().length > 0);
  const initialTag = hasTagFilter ? tagParam?.trim() : undefined;

  if (feedMode === "discover" && !hasTagFilter) {
    return (
      <DiscoverFeedWrapper
        sectionPage={1}
        sectionsPerPage={INITIAL_DISCOVER_SECTIONS_PER_PAGE}
        recencyDays={90}
      />
    );
  }

  const pageMetadata = PAGE_METADATA.bookmarks;

  return (
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
  );
}

export default function BookmarksPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const pageMetadata = PAGE_METADATA.bookmarks;
  const schemaParams = {
    path: "/bookmarks",
    title: pageMetadata.title,
    description: pageMetadata.description,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
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

  return (
    <>
      <JsonLdScript data={generateSchemaGraph(schemaParams)} />
      <Suspense fallback={<DiscoverFeedSkeleton />}>
        <BookmarksContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
