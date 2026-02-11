/**
 * Domain-specific Bookmark Page with user-friendly URLs
 *
 * Displays bookmarks for a specific domain using a clean URL.
 *
 * @module app/bookmarks/[slug]/page
 */

import { Suspense } from "react";
import { BookmarkDetail } from "@/components/features/bookmarks/bookmark-detail";
import { getBookmarkById } from "@/lib/bookmarks/service.server";
import { TIME_CONSTANTS } from "@/lib/constants";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/url-utils";
import { formatSeoDate } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { buildOgImageUrl } from "@/lib/og-image/build-og-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RelatedContent, RelatedContentFallback } from "@/components/features/related-content";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { resolveBookmarkIdFromSlug } from "@/lib/bookmarks/slug-helpers";
import { envLogger } from "@/lib/utils/env-logger";
import { cacheContextGuards } from "@/lib/cache";
import { ensureProtocol, stripWwwPrefix } from "@/lib/utils/url-utils";
import { getCachedAnalysis } from "@/lib/ai-analysis/reader.server";
import type { BookmarkPageContext, UnifiedBookmark } from "@/types";
import type { BookmarkAiAnalysisResponse } from "@/types/schemas/bookmark-ai-analysis";
// CRITICAL: generateStaticParams() remains intentionally disabled for bookmarks.
// The sitemap now streams paginated S3 data at request time, so the build no longer
// enumerates bookmark slugs up-front. This keeps rendering dynamic while still
// producing full SEO coverage.

const BOOKMARK_PAGE_CACHE_SECONDS = Math.max(
  3600,
  Math.round(TIME_CONSTANTS.BOOKMARKS_PRELOAD_INTERVAL_MS / 1000),
);

const getBookmarkHostname = (rawUrl: string | null | undefined): string | null => {
  if (!rawUrl) {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(ensureProtocol(trimmed));
    const hostname = stripWwwPrefix(url.hostname).trim();
    return hostname || null;
  } catch {
    return null;
  }
};

async function resolveBookmarkBySlug(slug: string): Promise<UnifiedBookmark | null> {
  envLogger.group(
    "Bookmark Lookup Start",
    [
      { message: `Slug requested: "${slug}"` },
      {
        message: "Environment Variables",
        data: {
          NODE_ENV: process.env.NODE_ENV,
          API_BASE_URL: process.env.API_BASE_URL || "not set",
          NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || "not set",
          S3_BUCKET: process.env.S3_BUCKET ? "✓ set" : "✗ missing",
          S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ? "✓ set" : "✗ missing",
          S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ? "✓ set" : "✗ missing",
          NEXT_PUBLIC_S3_CDN_URL: process.env.NEXT_PUBLIC_S3_CDN_URL || "not set",
          S3_SERVER_URL: process.env.S3_SERVER_URL || "not set",
        },
      },
    ],
    { category: "BookmarkPage" },
  );

  try {
    envLogger.log("Resolving slug via cached mapping", undefined, { category: "BookmarkPage" });
    const bookmarkId = await resolveBookmarkIdFromSlug(slug);

    if (!bookmarkId) {
      envLogger.log(`Slug not found in mappings`, { slug }, { category: "BookmarkPage" });
      return null;
    }

    envLogger.log(`Slug mapped to ID`, { slug, bookmarkId }, { category: "BookmarkPage" });

    const bookmark = (await getBookmarkById(bookmarkId, {
      includeImageData: true,
    })) as UnifiedBookmark | null;

    if (bookmark) {
      envLogger.log(
        `Bookmark lookup result`,
        { bookmarkId, found: true },
        { category: "BookmarkPage" },
      );
      return bookmark;
    }

    envLogger.log(
      "Per-ID bookmark JSON missing; returning null instead of scanning full dataset",
      { bookmarkId },
      { category: "BookmarkPage" },
    );

    return null;
  } catch (error) {
    console.error(`[BookmarkPage] Error finding bookmark by slug "${slug}":`, error);
    return null;
  }
}

async function findBookmarkBySlug(slug: string): Promise<UnifiedBookmark | null> {
  "use cache";
  cacheContextGuards.cacheLife("BookmarkPage", { revalidate: BOOKMARK_PAGE_CACHE_SECONDS });
  cacheContextGuards.cacheTag("BookmarkPage", "bookmarks", `bookmark-slug-${slug}`);

  const bookmark = await resolveBookmarkBySlug(slug);

  if (bookmark?.id) {
    cacheContextGuards.cacheTag("BookmarkPage", `bookmark-${bookmark.id}`);
  }

  return bookmark;
}

/**
 * Generate metadata for this bookmark page
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const { slug } = await Promise.resolve(params);
  const path = `/bookmarks/${slug}`;
  const bookmark = await findBookmarkBySlug(slug);

  if (!bookmark) {
    return {
      ...getStaticPageMetadata(path, "bookmarks"),
      title: "Bookmark Not Found",
      description: "The requested bookmark could not be found.",
    };
  }

  const baseMetadata = getStaticPageMetadata(path, "bookmarks");
  const customTitle = generateDynamicTitle(bookmark.title || "Bookmark", "bookmarks");

  const domainName = getBookmarkHostname(bookmark.url) ?? "website";

  const customDescription =
    bookmark.description || `A bookmark from ${domainName} that I've saved for future reference.`;

  let screenshotUrl: string | undefined;
  try {
    const rawImageUrl = selectBestImage(bookmark, {
      includeScreenshots: true,
    });
    if (typeof rawImageUrl === "string" && rawImageUrl.length > 0) {
      screenshotUrl = rawImageUrl;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Failed to resolve bookmark metadata image",
      { slug, bookmarkId: bookmark.id, error: message },
      { category: "BookmarkPage" },
    );
  }

  const ogImageUrl = buildOgImageUrl("bookmarks", {
    title: bookmark.title ?? "Bookmark",
    domain: domainName !== "website" ? domainName : undefined,
    screenshotUrl,
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
      type: "article",
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
export default async function BookmarkPage({ params }: BookmarkPageContext) {
  const { slug } = await Promise.resolve(params);
  envLogger.log(`Page rendering`, { slug }, { category: "BookmarkPage" });
  const foundBookmark = await findBookmarkBySlug(slug);

  if (!foundBookmark) {
    console.error(`[BookmarkPage] BOOKMARK NOT FOUND for slug: "${slug}" - returning 404`);

    // Check if this might be a blog post slug that was incorrectly routed
    if (slug.startsWith("blog-") || slug.includes("-blog-")) {
      // This looks like a blog post slug, suggest the correct URL
      envLogger.log(
        `Potential blog slug detected in bookmark route: ${slug}. User should be redirected to /blog/${slug.replace(/^blog-/, "")}`,
        undefined,
        { category: "BookmarkPage" },
      );
    }

    // Check if this might be a project slug
    if (slug.startsWith("project-") || slug.includes("-project-")) {
      envLogger.log(
        `Potential project slug detected in bookmark route: ${slug}. User should be redirected to /projects/${slug}`,
        undefined,
        { category: "BookmarkPage" },
      );
    }

    return notFound();
  }

  envLogger.log(
    `Found bookmark`,
    {
      id: foundBookmark.id,
      url: foundBookmark.url,
      title: foundBookmark.title,
    },
    { category: "BookmarkPage" },
  );

  let cachedAnalysis: Awaited<ReturnType<typeof getCachedAnalysis<BookmarkAiAnalysisResponse>>> =
    null;
  try {
    cachedAnalysis = await getCachedAnalysis<BookmarkAiAnalysisResponse>(
      "bookmarks",
      foundBookmark.id,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    envLogger.log(
      "Failed to load cached bookmark analysis",
      { slug, bookmarkId: foundBookmark.id, error: message },
      { category: "BookmarkPage" },
    );
  }

  if (cachedAnalysis) {
    envLogger.log(
      `Using cached AI analysis`,
      { bookmarkId: foundBookmark.id, generatedAt: cachedAnalysis.metadata.generatedAt },
      { category: "BookmarkPage" },
    );
  }

  const domainName = getBookmarkHostname(foundBookmark.url) ?? "website";

  const pageTitle = "Bookmark";
  const pageDescription = domainName
    ? `This is a bookmark from ${domainName} I saved and found useful.`
    : "This is a bookmark I saved and found useful.";

  // Generate schema for this individual bookmark page
  const path = `/bookmarks/${slug}`;
  const pageMetadata = PAGE_METADATA.bookmarks;
  const schemaParams = {
    path,
    title: foundBookmark.title || pageTitle,
    description: foundBookmark.description || pageDescription,
    datePublished: formatSeoDate(pageMetadata.dateCreated),
    dateModified: formatSeoDate(pageMetadata.dateModified),
    type: "collection" as const,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/bookmarks", name: "Bookmarks" },
      { path, name: foundBookmark.title || pageTitle },
    ],
  };
  const jsonLdData = generateSchemaGraph(schemaParams);

  return (
    <>
      <JsonLdScript data={jsonLdData} />

      {/* Stunning Individual Bookmark Page - Add consistent container */}
      <div className="max-w-6xl mx-auto">
        <BookmarkDetail bookmark={foundBookmark} cachedAnalysis={cachedAnalysis} />
      </div>

      {/* Enhanced Related Content Section */}
      <div className="bg-gradient-to-b from-background to-secondary/20">
        <div className="max-w-6xl mx-auto px-8 md:px-12 lg:px-16 py-16">
          <Suspense
            fallback={
              <RelatedContentFallback
                title="Discover Similar Content"
                className="relative"
                cardCount={3}
              />
            }
          >
            <RelatedContent
              sourceType="bookmark"
              sourceId={foundBookmark.id}
              sectionTitle="Discover Similar Content"
              options={{
                maxPerType: 3,
                maxTotal: 12,
                excludeTypes: [], // Include all content types
              }}
              className="relative"
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}
