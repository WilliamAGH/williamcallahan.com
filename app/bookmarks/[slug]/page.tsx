/**
 * Domain-specific Bookmark Page with user-friendly URLs
 *
 * Displays bookmarks for a specific domain using a clean URL.
 *
 * @module app/bookmarks/[slug]/page
 */

// Configure for dynamic rendering - consistent with all other bookmark routes
export const dynamic = "force-dynamic";
// Revalidate cache every 30 minutes - consistent with other bookmark routes  
export const revalidate = 1800;

import { BookmarkDetail } from "@/components/features/bookmarks/bookmark-detail";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { getStaticPageMetadata } from "@/lib/seo";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { PAGE_METADATA } from "@/data/metadata";
import { formatSeoDate } from "@/lib/seo/utils";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { OG_IMAGE_DIMENSIONS } from "@/data/metadata";
import { RelatedContent } from "@/components/features/related-content";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { loadSlugMapping, generateSlugMapping, getBookmarkIdFromSlug } from "@/lib/bookmarks/slug-manager";
import { envLogger } from "@/lib/utils/env-logger";

// CRITICAL: generateStaticParams() is INTENTIONALLY DISABLED for individual bookmarks
// Issue #sitemap-2024: Even though this prevents static generation, sitemap.ts
// MANUALLY adds all bookmark URLs by calling getBookmarksForStaticBuildAsync().
// This hybrid approach allows dynamic rendering (no build-time S3 dependency)
// while still including URLs in sitemap. Blog posts use full static generation
// because they read from local files. Bookmarks can't because S3 is async-only.
//
// export async function generateStaticParams(): Promise<{ slug: string }[]> {
//   // Disabled - sitemap.ts handles URL generation separately
// }

// Helper function to find bookmark by slug using pre-computed mappings
async function findBookmarkBySlug(slug: string): Promise<import("@/types").UnifiedBookmark | null> {
  // Enhanced logging for environment detection issues
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
          S3_CDN_URL: process.env.S3_CDN_URL || "not set",
          S3_SERVER_URL: process.env.S3_SERVER_URL || "not set",
        },
      },
    ],
    { category: "BookmarkPage" }
  );

  try {
    // Try to load the pre-computed slug mapping
    envLogger.log("Loading slug mapping from S3", undefined, { category: "BookmarkPage" });
    let mapping = await loadSlugMapping();

    // If no mapping exists, generate it (this should only happen during build)
    if (!mapping) {
      console.warn(`[BookmarkPage] No slug mapping found in S3, generating dynamically...`);
      // Fetch with image data once so we can reuse for the final lookup
      const allBookmarks = (await getBookmarks({
        ...DEFAULT_BOOKMARK_OPTIONS,
        includeImageData: true,
        skipExternalFetch: false,
        force: false,
      })) as import("@/types").UnifiedBookmark[];
      envLogger.log(
        `Loaded bookmarks for dynamic mapping`,
        allBookmarks?.length || 0,
        { category: "BookmarkPage" }
      );

      if (!allBookmarks || allBookmarks.length === 0) {
        console.error(`[BookmarkPage] No bookmarks available to generate mapping`);
        return null;
      }
      mapping = generateSlugMapping(allBookmarks);
      envLogger.log(
        `Generated mapping`,
        { slugCount: Object.keys(mapping.slugs).length },
        { category: "BookmarkPage" }
      );

      // We can return immediately if the slug is found, reusing allBookmarks
      const bookmarkIdFromGenerated = getBookmarkIdFromSlug(mapping, slug);
      envLogger.log(
        `Slug lookup in generated mapping`,
        { slug, foundId: bookmarkIdFromGenerated || "none" },
        { category: "BookmarkPage" }
      );
      return bookmarkIdFromGenerated ? allBookmarks.find((b) => b.id === bookmarkIdFromGenerated) || null : null;
    }

    envLogger.log(
      "Loaded slug mapping",
      {
        entries: Object.keys(mapping.slugs).length,
        version: mapping.version,
        generated: mapping.generated,
      },
      { category: "BookmarkPage" }
    );

    // Look up the bookmark ID from the slug
    const bookmarkId = getBookmarkIdFromSlug(mapping, slug);
    envLogger.log(
      `Slug mapped to ID`,
      { slug, bookmarkId: bookmarkId || "NOT FOUND" },
      { category: "BookmarkPage" }
    );

    if (!bookmarkId) {
      console.error(`[BookmarkPage] No bookmark ID found for slug "${slug}"`);
      envLogger.debug(
        "Available slugs (first 10)",
        Object.values(mapping.slugs)
          .slice(0, 10)
          .map((e) => e.slug),
        { category: "BookmarkPage" }
      );
      return null;
    }

    // Load all bookmarks and find the one with matching ID
    envLogger.log(`Loading bookmarks to find ID`, bookmarkId, { category: "BookmarkPage" });
    const allBookmarks = (await getBookmarks({
      ...DEFAULT_BOOKMARK_OPTIONS,
      includeImageData: true,
      skipExternalFetch: false,
      force: false,
    })) as import("@/types").UnifiedBookmark[];
    envLogger.log(`Loaded bookmarks`, allBookmarks?.length || 0, { category: "BookmarkPage" });

    const foundBookmark = allBookmarks.find((b) => b.id === bookmarkId);
    envLogger.log(
      `Bookmark lookup result`,
      { bookmarkId, found: !!foundBookmark },
      { category: "BookmarkPage" }
    );
    return foundBookmark || null;
  } catch (error) {
    console.error(`[BookmarkPage] Error finding bookmark by slug "${slug}":`, error);
    return null;
  }
}

/**
 * Generate metadata for this bookmark page
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
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

  let domainName = "website";
  try {
    const url = new URL(bookmark.url.startsWith("http") ? bookmark.url : `https://${bookmark.url}`);
    domainName = url.hostname.replace(/^www\./, "");
  } catch {
    // domainName is already "website"
  }

  const customDescription =
    bookmark.description || `A bookmark from ${domainName} that I've saved for future reference.`;

  const rawImageUrl =
    selectBestImage(bookmark, {
      includeScreenshots: true,
    }) || undefined;
  const imageUrl = rawImageUrl ? ensureAbsoluteUrl(rawImageUrl) : undefined;

  const openGraphImages = imageUrl
    ? [
        {
          url: imageUrl,
          width: OG_IMAGE_DIMENSIONS.legacy.width,
          height: OG_IMAGE_DIMENSIONS.legacy.height,
          alt: customTitle,
        },
      ]
    : baseMetadata.openGraph?.images || [];

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
      images: openGraphImages,
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      images: imageUrl ? [{ url: imageUrl, alt: customTitle }] : baseMetadata.twitter?.images || [],
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

import type { BookmarkPageContext } from "@/types";

export default async function BookmarkPage({ params }: BookmarkPageContext) {
  const { slug } = await Promise.resolve(params);
  envLogger.log(`Page rendering`, { slug }, { category: "BookmarkPage" });
  const foundBookmark = await findBookmarkBySlug(slug);

  if (!foundBookmark) {
    console.error(`[BookmarkPage] BOOKMARK NOT FOUND for slug: "${slug}" - returning 404`);

    // Check if this might be a blog post slug that was incorrectly routed
    if (slug.startsWith("blog-") || slug.includes("-blog-")) {
      // This looks like a blog post slug, suggest the correct URL
      console.warn(
        `[BookmarkPage] Potential blog slug detected in bookmark route: ${slug}. ` +
          `User should be redirected to /blog/${slug.replace(/^blog-/, "")}`,
      );
    }

    // Check if this might be a project slug
    if (slug.startsWith("project-") || slug.includes("-project-")) {
      console.warn(
        `[BookmarkPage] Potential project slug detected in bookmark route: ${slug}. ` +
          `User should be redirected to /projects#${slug}`,
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
    { category: "BookmarkPage" }
  );

  let domainName = "";
  try {
    const url = new URL(foundBookmark.url.startsWith("http") ? foundBookmark.url : `https://${foundBookmark.url}`);
    domainName = url.hostname.replace(/^www\./, "");
  } catch {
    domainName = "website";
  }

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
        <BookmarkDetail bookmark={foundBookmark} />
      </div>

      {/* Enhanced Related Content Section */}
      <div className="bg-gradient-to-b from-background to-secondary/20">
        <div className="max-w-6xl mx-auto px-8 md:px-12 lg:px-16 py-16">
          <RelatedContent
            sourceType="bookmark"
            sourceId={foundBookmark.id}
            sectionTitle="Discover Similar Content"
            options={{
              maxPerType: 4,
              maxTotal: 12,
              excludeTypes: [], // Include all content types
            }}
            className="relative"
          />
        </div>
      </div>
    </>
  );
}
