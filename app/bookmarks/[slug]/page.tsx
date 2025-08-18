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

import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getBookmarks } from "@/lib/bookmarks/service.server";
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
import { convertBookmarksToSerializable } from "@/lib/bookmarks/utils";
import { RelatedContent } from "@/components/features/related-content";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import { loadSlugMapping, generateSlugMapping, getBookmarkIdFromSlug } from "@/lib/bookmarks/slug-manager";

// NOTE: Static generation disabled - using force-dynamic for consistency
// All bookmark routes now use dynamic rendering to avoid build-time S3 dependency
// and ensure consistent behavior between development and production environments.
// Pages are dynamically generated at runtime with ISR caching (30 min revalidation).
//
// export async function generateStaticParams(): Promise<{ slug: string }[]> {
//   // Disabled - see note above
// }

// Helper function to find bookmark by slug using pre-computed mappings
async function findBookmarkBySlug(slug: string): Promise<import("@/types").UnifiedBookmark | null> {
  // Enhanced logging for environment detection issues
  console.log(`[BookmarkPage] ========== BOOKMARK LOOKUP START ==========`);
  console.log(`[BookmarkPage] Slug requested: "${slug}"`);
  console.log(`[BookmarkPage] Environment Variables:`);
  console.log(`[BookmarkPage]   - NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[BookmarkPage]   - API_BASE_URL: ${process.env.API_BASE_URL || "not set"}`);
  console.log(`[BookmarkPage]   - NEXT_PUBLIC_SITE_URL: ${process.env.NEXT_PUBLIC_SITE_URL || "not set"}`);
  console.log(`[BookmarkPage]   - S3_BUCKET: ${process.env.S3_BUCKET ? "✓ set" : "✗ missing"}`);
  console.log(`[BookmarkPage]   - S3_ACCESS_KEY_ID: ${process.env.S3_ACCESS_KEY_ID ? "✓ set" : "✗ missing"}`);
  console.log(`[BookmarkPage]   - S3_SECRET_ACCESS_KEY: ${process.env.S3_SECRET_ACCESS_KEY ? "✓ set" : "✗ missing"}`);
  console.log(`[BookmarkPage]   - S3_CDN_URL: ${process.env.S3_CDN_URL || "not set"}`);
  console.log(`[BookmarkPage]   - S3_SERVER_URL: ${process.env.S3_SERVER_URL || "not set"}`);

  try {
    // Try to load the pre-computed slug mapping
    console.log(`[BookmarkPage] Attempting to load slug mapping from S3...`);
    let mapping = await loadSlugMapping();

    // If no mapping exists, generate it (this should only happen during build)
    if (!mapping) {
      console.warn(`[BookmarkPage] No slug mapping found in S3, generating dynamically...`);
      // Fetch with image data once so we can reuse for the final lookup
      const allBookmarks = (await getBookmarks({
        includeImageData: true,
      })) as import("@/types").UnifiedBookmark[];
      console.log(`[BookmarkPage] Loaded ${allBookmarks?.length || 0} bookmarks for dynamic mapping`);

      if (!allBookmarks || allBookmarks.length === 0) {
        console.error(`[BookmarkPage] No bookmarks available to generate mapping`);
        return null;
      }
      mapping = generateSlugMapping(allBookmarks);
      console.log(`[BookmarkPage] Generated mapping with ${Object.keys(mapping.slugs).length} slugs`);

      // We can return immediately if the slug is found, reusing allBookmarks
      const bookmarkIdFromGenerated = getBookmarkIdFromSlug(mapping, slug);
      console.log(
        `[BookmarkPage] Looked up slug "${slug}" in generated mapping, found ID: ${bookmarkIdFromGenerated || "none"}`,
      );
      return bookmarkIdFromGenerated ? allBookmarks.find((b) => b.id === bookmarkIdFromGenerated) || null : null;
    }

    console.log(`[BookmarkPage] Loaded slug mapping with ${Object.keys(mapping.slugs).length} entries`);
    console.log(`[BookmarkPage] Mapping version: ${mapping.version}, generated: ${mapping.generated}`);

    // Look up the bookmark ID from the slug
    const bookmarkId = getBookmarkIdFromSlug(mapping, slug);
    console.log(`[BookmarkPage] Slug "${slug}" mapped to ID: ${bookmarkId || "NOT FOUND"}`);

    if (!bookmarkId) {
      console.error(`[BookmarkPage] No bookmark ID found for slug "${slug}"`);
      console.log(
        `[BookmarkPage] Available slugs (first 10): ${Object.values(mapping.slugs)
          .slice(0, 10)
          .map((e) => e.slug)
          .join(", ")}`,
      );
      return null;
    }

    // Load all bookmarks and find the one with matching ID
    console.log(`[BookmarkPage] Loading all bookmarks to find ID ${bookmarkId}...`);
    const allBookmarks = (await getBookmarks({
      includeImageData: true,
    })) as import("@/types").UnifiedBookmark[];
    console.log(`[BookmarkPage] Loaded ${allBookmarks?.length || 0} bookmarks`);

    const foundBookmark = allBookmarks.find((b) => b.id === bookmarkId);
    console.log(`[BookmarkPage] Bookmark ${bookmarkId} ${foundBookmark ? "FOUND" : "NOT FOUND"} in bookmarks data`);
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
  console.log(`[BookmarkPage] Page component rendering for slug: "${slug}"`);
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

  console.log(
    `[BookmarkPage] Successfully found bookmark: ID=${foundBookmark.id}, URL=${foundBookmark.url}, Title="${foundBookmark.title}"`,
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
      <div className="max-w-5xl mx-auto space-y-8">
        <BookmarksServer
          title={`Detail view for ${foundBookmark.title || "Bookmark"}`}
          description="A detailed view of a single saved bookmark."
          bookmarks={convertBookmarksToSerializable([foundBookmark])}
          usePagination={false}
          showFilterBar={false}
        />

        {/* Similar Content Section */}
        {/* Intentionally omit sourceSlug to avoid redundant slug->ID resolution */}
        <RelatedContent
          sourceType="bookmark"
          sourceId={foundBookmark.id}
          sectionTitle="You might also like"
          options={{
            maxPerType: 3,
            maxTotal: 9,
            excludeTypes: [], // Include all content types
          }}
          className="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700"
        />
      </div>
    </>
  );
}
