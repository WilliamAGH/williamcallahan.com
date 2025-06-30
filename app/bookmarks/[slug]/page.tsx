/**
 * Domain-specific Bookmark Page with user-friendly URLs
 *
 * Displays bookmarks for a specific domain using a clean URL.
 *
 * @module app/bookmarks/[slug]/page
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";

import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "@/components/seo/json-ld";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { generateDynamicTitle } from "@/lib/seo/dynamic-metadata";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { OG_IMAGE_DIMENSIONS } from "@/data/metadata";

// No static params generation for dynamic pages

// Helper function to find bookmark by slug
async function findBookmarkBySlug(slug: string) {
  const allBookmarks = (await getBookmarks({ includeImageData: true })) as import("@/types").UnifiedBookmark[];

  // Pre-generate all slugs once to avoid O(n²) complexity
  const bookmarkWithSlugs = allBookmarks.map((bookmark) => ({
    bookmark,
    slug: generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id),
  }));

  const found = bookmarkWithSlugs.find((item) => item.slug === slug);
  return found?.bookmark || null;
}

/**
 * Generate metadata for this bookmark page
 */
export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  const path = `/bookmarks/${paramsResolved.slug}`;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  // Fetch bookmark data to create more specific metadata
  const { slug } = paramsResolved;
  const foundBookmark = await findBookmarkBySlug(slug);

  // If no bookmark is found, return basic metadata
  if (!foundBookmark) {
    return {
      ...baseMetadata,
      title: "Bookmark | William Callahan",
    };
  }

  // Extract domain for display
  let domainName = "";
  try {
    const url = new URL(foundBookmark.url.startsWith("http") ? foundBookmark.url : `https://${foundBookmark.url}`);
    domainName = url.hostname.replace(/^www\./, "");
  } catch {
    domainName = "website";
  }

  // Create custom title and description based on the bookmark
  const customTitle = generateDynamicTitle(foundBookmark.title || "Bookmark", "bookmarks");
  const customDescription =
    foundBookmark.description || `A bookmark from ${domainName} that I've saved for future reference.`;

  // Create image URL if available using the proper helper
  const { selectBestImage } = await import("@/lib/bookmarks/bookmark-helpers");
  const rawImageUrl =
    selectBestImage(foundBookmark, {
      preferOpenGraph: true,
      includeScreenshots: true,
    }) || undefined;
  const imageUrl = rawImageUrl ? ensureAbsoluteUrl(rawImageUrl) : undefined;

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: "article",
      url: ensureAbsoluteUrl(`/bookmarks/${slug}`),
      ...(imageUrl && {
        images: [
          {
            url: imageUrl,
            width: OG_IMAGE_DIMENSIONS.legacy.width,
            height: OG_IMAGE_DIMENSIONS.legacy.height,
            alt: customTitle,
          },
        ],
      }),
    },
    twitter: {
      ...baseMetadata.twitter,
      card: "summary_large_image",
      title: customTitle,
      description: customDescription,
      ...(imageUrl && {
        images: [
          {
            url: imageUrl,
            alt: customTitle,
          },
        ],
      }),
    },
    alternates: {
      canonical: ensureAbsoluteUrl(`/bookmarks/${slug}`),
    },
  };
}

import type { BookmarkPageContext } from "@/types";

export default async function BookmarkPage({ params }: BookmarkPageContext) {
  // Await params to fix Next.js warning
  const paramsResolved = await Promise.resolve(params);
  const { slug } = paramsResolved;
  const foundBookmark = await findBookmarkBySlug(slug);

  // If no bookmark matches this slug, show a 404
  if (!foundBookmark) {
    return notFound();
  }

  // Extract domain for display purposes (needed for JSON-LD)
  let domainName = "";
  try {
    const url = new URL(foundBookmark.url.startsWith("http") ? foundBookmark.url : `https://${foundBookmark.url}`);
    domainName = url.hostname.replace(/^www\./, "");
  } catch {
    domainName = "website";
  }

  // Generate truncated title for SEO
  const seoTitle = generateDynamicTitle(foundBookmark.title || "Bookmark", "bookmarks");

  // Determine best image for JSON-LD if available
  const { selectBestImage } = await import("@/lib/bookmarks/bookmark-helpers");
  const rawImageUrl =
    selectBestImage(foundBookmark, {
      preferOpenGraph: true,
      includeScreenshots: true,
    }) || undefined;
  const imageUrl = rawImageUrl ? ensureAbsoluteUrl(rawImageUrl) : undefined;

  // Build Schema.org graph using central builder
  const { generateSchemaGraph } = await import("@/lib/seo/schema");

  const toIso = (value: string | Date | undefined): string => {
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    return new Date().toISOString();
  };

  const rawTags: Array<string | { name: string }> = Array.isArray(foundBookmark.tags) ? foundBookmark.tags : [];
  const keywords = rawTags.map((t) => (typeof t === "string" ? t : t.name));

  const jsonLdData = generateSchemaGraph({
    path: `/bookmarks/${slug}`,
    title: seoTitle,
    description: foundBookmark.description || `A bookmark from ${domainName}`,
    datePublished: toIso(foundBookmark.dateBookmarked),
    dateModified: toIso(foundBookmark.modifiedAt ?? foundBookmark.dateBookmarked),
    type: "bookmark-item",
    image: imageUrl
      ? {
          url: imageUrl,
          width: OG_IMAGE_DIMENSIONS.legacy.width,
          height: OG_IMAGE_DIMENSIONS.legacy.height,
          caption: seoTitle,
        }
      : undefined,
    keywords,
  });

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title="Bookmark"
          description={
            domainName
              ? `This is a bookmark from ${domainName} I saved and found useful.`
              : "This is a bookmark I saved and found useful."
          }
          bookmarks={[foundBookmark]}
          showFilterBar={false}
          usePagination={false}
        />
      </div>
    </>
  );
}
