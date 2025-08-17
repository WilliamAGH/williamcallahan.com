/**
 * Domain-specific Bookmark Page with user-friendly URLs
 *
 * Displays bookmarks for a specific domain using a clean URL.
 *
 * @module app/bookmarks/[slug]/page
 */

// Configure for static generation with ISR
export const revalidate = 3600; // Revalidate every hour
export const dynamicParams = true; // Allow dynamic params for new bookmarks

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

// Generate static params for all bookmarks at build time
// This is optional - if it fails, pages will be generated dynamically
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  // Skip static generation in development
  if (process.env.NODE_ENV === "development") {
    return [];
  }

  try {
    // Try to load existing slug mapping from S3
    // This might fail during build if S3 isn't accessible
    const mapping = await loadSlugMapping();

    // If no mapping exists, skip static generation
    // Pages will be generated dynamically at runtime
    if (!mapping) {
      console.log("Slug mapping not available during build - using dynamic generation");
      return [];
    }

    // Return all slug params for static generation
    const params = Object.values(mapping.slugs).map((entry) => ({
      slug: entry.slug,
    }));

    console.log(`Generating static params for ${params.length} bookmark pages`);
    return params;
  } catch (error) {
    // Don't fail the build if static generation fails
    // Pages will be generated dynamically at runtime
    console.log(
      "Static generation skipped for bookmarks - using dynamic generation:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return [];
  }
}

// Helper function to find bookmark by slug using pre-computed mappings
async function findBookmarkBySlug(slug: string): Promise<import("@/types").UnifiedBookmark | null> {
  try {
    // Try to load the pre-computed slug mapping
    let mapping = await loadSlugMapping();

    // If no mapping exists, generate it (this should only happen during build)
    if (!mapping) {
      // Fetch with image data once so we can reuse for the final lookup
      const allBookmarks = (await getBookmarks({
        includeImageData: true,
      })) as import("@/types").UnifiedBookmark[];
      if (!allBookmarks || allBookmarks.length === 0) {
        return null;
      }
      mapping = generateSlugMapping(allBookmarks);
      // We can return immediately if the slug is found, reusing allBookmarks
      const bookmarkIdFromGenerated = getBookmarkIdFromSlug(mapping, slug);
      return bookmarkIdFromGenerated ? allBookmarks.find((b) => b.id === bookmarkIdFromGenerated) || null : null;
    }

    // Look up the bookmark ID from the slug
    const bookmarkId = getBookmarkIdFromSlug(mapping, slug);
    if (!bookmarkId) {
      return null;
    }

    // Load all bookmarks and find the one with matching ID
    const allBookmarks = (await getBookmarks({
      includeImageData: true,
    })) as import("@/types").UnifiedBookmark[];
    return allBookmarks.find((b) => b.id === bookmarkId) || null;
  } catch (error) {
    console.error("Error finding bookmark by slug:", error);
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
      preferOpenGraph: true,
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
  const foundBookmark = await findBookmarkBySlug(slug);

  if (!foundBookmark) {
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

        {/* Related Content Section */}
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
