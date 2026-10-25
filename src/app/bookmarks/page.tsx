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
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod/v4";
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
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { getNotFoundMetadata } from "@/lib/seo/not-found-metadata";

const INITIAL_DISCOVER_SECTIONS_PER_PAGE = 2;
type BookmarksPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;
const pageNumberSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .pipe(z.coerce.number<string>().int().max(Number.MAX_SAFE_INTEGER));

async function resolveBookmarksPage(searchParams: BookmarksPageProps["searchParams"]) {
  const params = await searchParams;
  const tagParam = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const initialTag = tagParam?.trim() || undefined;
  const feedMode = params.feed === "latest" ? "latest" : "discover";
  let initialPage = 1;
  if (feedMode === "latest" && !initialTag) {
    const parsedPage = pageNumberSchema.safeParse(params.page ?? "1");
    if (!parsedPage.success) return null;
    initialPage = parsedPage.data;
    if (initialPage > 1) {
      const index = await getBookmarksIndex();
      if (!index || initialPage > index.totalPages) return null;
    }
  }
  const path = initialPage > 1 ? `/bookmarks?feed=latest&page=${initialPage}` : "/bookmarks";
  const title =
    initialPage > 1
      ? `${PAGE_METADATA.bookmarks.title} — Page ${initialPage}`
      : PAGE_METADATA.bookmarks.title;
  return { initialTag, feedMode, initialPage, path, title };
}

/**
 * Generate metadata for the Bookmarks page
 */
export async function generateMetadata({ searchParams }: BookmarksPageProps): Promise<Metadata> {
  const page = await resolveBookmarksPage(searchParams);
  if (!page) return getNotFoundMetadata("Bookmarks");
  const metadata = getStaticPageMetadata(page.path, "bookmarks");
  if (page.initialPage === 1) return metadata;
  return {
    ...metadata,
    title: page.title,
    openGraph: { ...metadata.openGraph, title: page.title },
    twitter: { ...metadata.twitter, title: page.title },
  };
}

/**
 * Runtime policy
 * cacheComponents disallows route-level `dynamic` flags (see https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents);
 * Query-dependent content stays beneath Suspense; the existing bookmark caches own freshness.
 */

async function BookmarksContent({ searchParams }: BookmarksPageProps) {
  const page = await resolveBookmarksPage(searchParams);
  if (!page) notFound();
  const { initialTag, feedMode, initialPage, path, title } = page;
  const pageMetadata = PAGE_METADATA.bookmarks;
  const schemaParams = {
    path,
    title,
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
      ...(initialPage > 1 ? [{ path, name: `Page ${initialPage}` }] : []),
    ],
  };

  return (
    <>
      <JsonLdScript data={generateSchemaGraph(schemaParams)} />
      {feedMode === "discover" && !initialTag ? (
        <DiscoverFeedWrapper
          sectionPage={1}
          sectionsPerPage={INITIAL_DISCOVER_SECTIONS_PER_PAGE}
          recencyDays={90}
        />
      ) : (
        <div className="max-w-5xl mx-auto">
          <BookmarksServer
            key={`${feedMode}:${initialPage}:${initialTag ?? ""}`}
            title={title}
            description={pageMetadata.description}
            initialPage={initialPage}
            includeImageData
            initialTag={initialTag}
            tag={initialTag}
            feedMode="latest"
          />
        </div>
      )}
    </>
  );
}

export default function BookmarksPage({ searchParams }: BookmarksPageProps) {
  return (
    <Suspense fallback={<DiscoverFeedSkeleton />}>
      <BookmarksContent searchParams={searchParams} />
    </Suspense>
  );
}
