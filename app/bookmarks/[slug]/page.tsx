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
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import type { UnifiedBookmark } from "@/types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

/**
 * Generate static paths for slug pages
 */
export async function generateStaticParams() {
  const bookmarks = await getBookmarksForStaticBuild();
  return bookmarks.map((bookmark) => ({
    slug: generateUniqueSlug(bookmark.url, bookmarks, bookmark.id),
  }));
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
  const allBookmarks = await getBookmarksForStaticBuild();
  const { slug } = paramsResolved;

  // Find the bookmark that matches this slug
  let foundBookmark: UnifiedBookmark | null = null;
  for (const bookmark of allBookmarks) {
    const bookmarkSlug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
    if (bookmarkSlug === slug) {
      foundBookmark = bookmark;
      break;
    }
  }

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
  const customTitle = `${foundBookmark.title || "Bookmark"} | William Callahan`;
  const customDescription =
    foundBookmark.description || `A bookmark from ${domainName} that I've saved for future reference.`;

  // Create image URL if available
  let imageUrl = foundBookmark.ogImage;
  if (!imageUrl && foundBookmark.content?.imageUrl) {
    imageUrl = foundBookmark.content.imageUrl;
  }

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: "article",
      url: `https://williamcallahan.com/bookmarks/${slug}`,
      ...(imageUrl && {
        images: [
          {
            url: imageUrl,
            width: 1200,
            height: 630,
            alt: foundBookmark.title || "Bookmark image",
          },
        ],
      }),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
      ...(imageUrl && {
        images: [
          {
            url: imageUrl,
            alt: foundBookmark.title || "Bookmark image",
          },
        ],
      }),
    },
    alternates: {
      canonical: `https://williamcallahan.com/bookmarks/${slug}`,
    },
  };
}

import type { BookmarkPageContext } from "@/types";

export default async function BookmarkPage({ params }: BookmarkPageContext) {
  const allBookmarks = await getBookmarksForStaticBuild();
  // Await params to fix Next.js warning
  const paramsResolved = await Promise.resolve(params);
  const { slug } = paramsResolved;

  // Find the bookmark that matches this slug
  let foundBookmark: UnifiedBookmark | null = null;

  for (const bookmark of allBookmarks) {
    const bookmarkSlug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
    if (bookmarkSlug === slug) {
      foundBookmark = bookmark;
      break;
    }
  }

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

  // Create enhanced JSON-LD data for better SEO
  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: foundBookmark.title || "Bookmark",
    description: foundBookmark.description || `A bookmark from ${domainName}`,
    url: `https://williamcallahan.com/bookmarks/${slug}`,
    mainEntity: {
      "@type": "WebPage",
      name: foundBookmark.title,
      url: foundBookmark.url,
      description: foundBookmark.description,
      publisher: {
        "@type": "Organization",
        name: domainName,
        url: `https://${domainName}`,
      },
    },
    author: {
      "@type": "Person",
      name: "William Callahan",
      url: "https://williamcallahan.com",
    },
    datePublished: foundBookmark.dateBookmarked || new Date().toISOString(),
  };

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
