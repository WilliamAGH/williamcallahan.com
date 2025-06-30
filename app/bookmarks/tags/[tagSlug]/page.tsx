/**
 * Bookmarks Tag Page
 *
 * Displays bookmarks tagged with a specific tag (first page).
 * Additional pages are handled by the paginated route.
 *
 * @module app/bookmarks/tags/[tagSlug]/page
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";
// Revalidate every 30 minutes for fresh content
export const revalidate = 1800;
// Force dynamic rendering and disable Next.js Data Cache for heavy tag list pages (we use our own cache via lib/image-memory-manager.ts)
export const fetchCache = "default-no-store";

import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { generateUniqueSlug } from "@/lib/utils/domain-utils";
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { getStaticPageMetadata } from "@/lib/seo/metadata";
import { generateDynamicTitle, generateTagDescription } from "@/lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { tagToSlug, sanitizeUnicode } from "@/lib/utils/tag-utils";
import type { Metadata } from "next";
import type { TagBookmarkContext } from "@/types";

/**
 * Generate static paths for tag pages
 */
export function generateStaticParams() {
  const bookmarks = getBookmarksForStaticBuild();
  const tags = bookmarks.flatMap((b) =>
    (Array.isArray(b.tags) ? b.tags : []).map((t: string | import("@/types").BookmarkTag) =>
      typeof t === "string" ? t : t.name,
    ),
  );
  const uniqueSlugs = Array.from(new Set(tags)).map((tag) => {
    // tag should now be string after the flatMap transformation
    return tagToSlug(tag);
  });
  return uniqueSlugs.map((tagSlug) => ({ tagSlug }));
}

/**
 * Generate metadata for this tag page
 */
export async function generateMetadata({ params }: TagBookmarkContext): Promise<Metadata> {
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  // Use sanitizeUnicode utility for consistency
  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Try to find the original tag capitalization (lightweight data)
  const allBookmarks = (await getBookmarks({ includeImageData: false })) as import("@/types").UnifiedBookmark[];
  let displayTag = tagQuery
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  // Look for the exact tag in bookmarks to get proper capitalization
  for (const bookmark of allBookmarks) {
    const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
    for (const t of bookmarkTags) {
      const tagName = typeof t === "string" ? t : t.name;
      if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
        if (/[A-Z]/.test(tagName.slice(1))) {
          displayTag = tagName; // Keep original mixed case (like iPhone)
        }
        break;
      }
    }
  }

  // Base metadata with custom title
  const path = `/bookmarks/tags/${paramsResolved.tagSlug}`;
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  // Override title and description with tag-specific values
  const customTitle = generateDynamicTitle(`${displayTag} Bookmarks`, "bookmarks", { isTag: true });
  const customDescription = generateTagDescription(displayTag, "bookmarks");

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      type: "website",
      url: ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}`),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
    },
    alternates: {
      canonical: ensureAbsoluteUrl(`/bookmarks/tags/${paramsResolved.tagSlug}`),
    },
  };
}

export default async function TagPage({ params }: TagBookmarkContext) {
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  // Use sanitizeUnicode utility for consistency
  const tagSlug = sanitizeUnicode(paramsResolved.tagSlug);
  const tagQuery = tagSlug.replace(/-/g, " ");

  // Use unified function that handles caching transparently
  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const result = await getBookmarksByTag(tagSlug, 1);
  const filtered = result.bookmarks;

  // Find the original tag with proper capitalization
  let displayTag = tagQuery;
  if (filtered.length > 0) {
    // Loop through filtered bookmarks to find the original tag format
    for (const bookmark of filtered) {
      const bookmarkTags = Array.isArray(bookmark.tags) ? bookmark.tags : [];
      for (const t of bookmarkTags) {
        const tagName = typeof t === "string" ? t : t.name;
        if (tagName.toLowerCase() === tagQuery.toLowerCase()) {
          // Format the tag: preserve if mixed-case (like aVenture or iPhone)
          if (/[A-Z]/.test(tagName.slice(1))) {
            displayTag = tagName;
          } else {
            // Title case otherwise
            displayTag = tagQuery
              .split(/[\s-]+/)
              .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(" ");
          }
          break;
        }
      }
    }
  }

  // Custom title and description for the tag page
  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = generateTagDescription(displayTag, "bookmarks");

  // Build itemList for first page (filtered list)
  const itemList = filtered.map((bookmark, idx) => {
    const slug = generateUniqueSlug(bookmark.url, filtered, bookmark.id);
    return {
      url: ensureAbsoluteUrl(`/bookmarks/${slug}`),
      position: idx + 1,
    };
  });

  const nowIso = new Date().toISOString();

  const jsonLdData = generateSchemaGraph({
    path: `/bookmarks/tags/${tagSlug}`,
    title: pageTitle,
    description: pageDescription,
    datePublished: nowIso,
    dateModified: nowIso,
    type: "bookmark-collection",
    itemList,
  });

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <div className="max-w-5xl mx-auto">
        <BookmarksServer
          title={pageTitle}
          description={pageDescription}
          bookmarks={filtered} // Pass the pre-filtered bookmarks
          tag={tagSlug} // Pass slug format for API compatibility
          showFilterBar={true}
          titleSlug={tagSlug}
          initialPage={1}
          baseUrl={`/bookmarks/tags/${tagSlug}`}
          initialTag={displayTag}
        />
      </div>
    </>
  );
}
