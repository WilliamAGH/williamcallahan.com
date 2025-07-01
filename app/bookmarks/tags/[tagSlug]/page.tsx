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

import type { Metadata } from "next";
import { BookmarksServer } from "@/components/features/bookmarks/bookmarks.server";
import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { getStaticPageMetadata } from "@/lib/seo";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { tagToSlug, sanitizeUnicode } from "@/lib/utils/tag-utils";
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
  const { tagSlug } = await Promise.resolve(params);
  const sanitizedSlug = sanitizeUnicode(tagSlug);
  const path = `/bookmarks/tags/${sanitizedSlug}`;

  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const { bookmarks } = await getBookmarksByTag(sanitizedSlug);

  if (bookmarks.length === 0) {
    return {
      ...getStaticPageMetadata(path, "bookmarks"),
      title: "No Bookmarks Found For This Tag",
    };
  }

  const displayTag = formatTagDisplay(sanitizedSlug.replace(/-/g, " "));
  const customTitle = generateDynamicTitle(`${displayTag} Bookmarks`, "bookmarks", {
    isTag: true,
  });
  const customDescription = generateTagDescription(displayTag, "bookmarks");
  const baseMetadata = getStaticPageMetadata(path, "bookmarks");

  return {
    ...baseMetadata,
    title: customTitle,
    description: customDescription,
    openGraph: {
      ...baseMetadata.openGraph,
      title: customTitle,
      description: customDescription,
      url: ensureAbsoluteUrl(path),
    },
    twitter: {
      ...baseMetadata.twitter,
      title: customTitle,
      description: customDescription,
    },
    alternates: {
      canonical: ensureAbsoluteUrl(path),
    },
  };
}

export default async function TagPage({ params }: TagBookmarkContext) {
  const { tagSlug } = await Promise.resolve(params);
  const sanitizedSlug = sanitizeUnicode(tagSlug);
  const { getBookmarksByTag } = await import("@/lib/bookmarks/service.server");
  const result = await getBookmarksByTag(sanitizedSlug, 1);

  const displayTag = formatTagDisplay(sanitizedSlug.replace(/-/g, " "));
  const pageTitle = `${displayTag} Bookmarks`;
  const pageDescription = generateTagDescription(displayTag, "bookmarks");

  return (
    <div className="max-w-5xl mx-auto">
      <BookmarksServer
        title={pageTitle}
        description={pageDescription}
        bookmarks={result.bookmarks}
        tag={sanitizedSlug}
        showFilterBar={true}
        titleSlug={sanitizedSlug}
        initialPage={1}
        baseUrl={`/bookmarks/tags/${sanitizedSlug}`}
        initialTag={displayTag}
      />
    </div>
  );
}
