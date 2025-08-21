/**
 * Bookmarks Server Component
 * @module components/features/bookmarks/bookmarks.server
 * @description
 * Server component that fetches and processes bookmarks data for client consumption.
 *
 * This component handles the conversion between UnifiedBookmark and SerializableBookmark formats,
 * using standardized utility functions from '@/lib/bookmarks/utils' to ensure consistency.
 * When includeImageData is false, it uses stripImageData() to create LightweightBookmark structures
 * that preserve essential rendering data like screenshotAssetId while excluding heavy image assets.
 */
import "server-only"; // Ensure this component remains server-only

// Defer heavy imports to reduce initial bundle size
const getBookmarks = async () => (await import("@/lib/bookmarks/service.server")).getBookmarks;
const getBookmarksPage = async () => (await import("@/lib/bookmarks/service.server")).getBookmarksPage;
const getBookmarksIndex = async () => (await import("@/lib/bookmarks/service.server")).getBookmarksIndex;
const normalizeBookmarkTag = async () => (await import("@/lib/bookmarks/utils")).normalizeBookmarkTag;
const stripImageData = async () => (await import("@/lib/bookmarks/utils")).stripImageData;
import { convertSerializableBookmarksToUnified } from "@/lib/bookmarks/utils";

import type { UnifiedBookmark } from "@/types";
import { BookmarksClientWithWindow } from "./bookmarks-client-with-window";

import type { JSX } from "react";
import { getBulkBookmarkSlugs } from "@/lib/bookmarks/slug-helpers";

import type { BookmarksServerExtendedProps, SerializableBookmark } from "@/types";

/**
 * Server-side React component that prepares and provides bookmark data to the client component.
 *
 * Fetches and sorts bookmarks by date if not provided via props, and passes all relevant data to {@link BookmarksClientWithWindow}.
 *
 * @remark Throws an error with message 'BookmarksUnavailable' in production if no bookmarks are available from either props or API, triggering an error boundary.
 *
 * @returns The rendered {@link BookmarksClientWithWindow} component with bookmark data and related props.
 *
 * @remark Uses standardized utility functions from '@/lib/bookmarks/utils' for data conversion
 * to ensure consistency with LightweightBookmark type definitions and preserve essential fields
 * like content.screenshotAssetId needed for fallback rendering.
 *
 * @returns The rendered {@link BookmarksClientWithWindow} component with processed bookmark data.
 * @throws {Error} If no bookmarks are available in production mode.
 */
export async function BookmarksServer({
  title,
  description,
  bookmarks: propsBookmarks,
  showFilterBar,
  titleSlug,
  initialPage,
  baseUrl,
  usePagination = true,
  initialTag,
  tag,
  includeImageData = true,
  allBookmarksForSlugs,
  totalPages: propsTotalPages,
  totalCount: propsTotalCount,
}: BookmarksServerExtendedProps): Promise<JSX.Element> {
  let bookmarks: UnifiedBookmark[] = [];
  let totalPages = 1;
  let totalCount = 0;
  const internalHrefs = new Map<string, string>();

  // Helper function to generate slugs for a list of bookmarks using pre-computed mappings
  const generateHrefs = async (bms: UnifiedBookmark[], allBms?: UnifiedBookmark[]) => {
    const allBookmarks = allBms || bms;
    const slugMap = await getBulkBookmarkSlugs(allBookmarks);

    bms.forEach(bookmark => {
      const slug = slugMap.get(bookmark.id);
      if (slug) {
        internalHrefs.set(bookmark.id, `/bookmarks/${slug}`);
      }
    });
  };

  // Helper function to sort bookmarks by date (newest first) - removed unused function

  if (propsBookmarks && propsBookmarks.length > 0 && allBookmarksForSlugs) {
    // Case: We have both bookmarks and allBookmarksForSlugs (paginated scenario)
    bookmarks = convertSerializableBookmarksToUnified(propsBookmarks);
    await generateHrefs(bookmarks, allBookmarksForSlugs);
    totalPages = propsTotalPages || 1;
    totalCount = propsTotalCount || bookmarks.length;
  } else if (propsBookmarks && propsBookmarks.length > 0) {
    // Case: We have bookmarks but need to fetch allBookmarksForSlugs
    bookmarks = convertSerializableBookmarksToUnified(propsBookmarks);
    const allBookmarksForSlugsData = (await (await getBookmarks())({ includeImageData: false })) as UnifiedBookmark[];
    totalPages = propsTotalPages || 1;
    totalCount = propsTotalCount || propsBookmarks.length;
    await generateHrefs(bookmarks, allBookmarksForSlugsData);
  } else if (initialPage && initialPage > 1) {
    const getBookmarksPageFunc = await getBookmarksPage();
    const getBookmarksIndexFunc = await getBookmarksIndex();
    const [pageData, indexData] = await Promise.all([getBookmarksPageFunc(initialPage), getBookmarksIndexFunc()]);
    bookmarks = pageData ?? [];
    totalPages = indexData?.totalPages ?? 1;
    totalCount = indexData?.count ?? 0;
    if (bookmarks.length > 0) {
      const allBookmarksForSlugs = (await (await getBookmarks())({ includeImageData: false })) as UnifiedBookmark[];
      await generateHrefs(bookmarks, allBookmarksForSlugs);
    }
  } else {
    // Default to fetching all bookmarks for the main page or if no specific page is set
    const allBookmarks = (await (await getBookmarks())({ includeImageData })) as UnifiedBookmark[];
    if (Array.isArray(allBookmarks) && allBookmarks.length > 0) {
      bookmarks = allBookmarks;
      const index = await (await getBookmarksIndex())();
      totalPages = index?.totalPages ?? 1;
      totalCount = index?.count ?? 0;
      await generateHrefs(bookmarks, allBookmarks);
    }
  }

  // Fallback if bookmarks are empty
  if (bookmarks.length === 0) {
    console.warn("[BookmarksServer] No bookmark data available after fetch.");
    // Allow empty state to render
  }

  // Transform to serializable format for client component
  // Using standardized utility functions to ensure consistency
  const normalizeFunc = await normalizeBookmarkTag();
  const stripImageDataFunc = await stripImageData();

  const serializableBookmarks: SerializableBookmark[] = bookmarks.map(bookmark => {
    // When includeImageData is false, use the standardized stripImageData utility
    if (!includeImageData) {
      const lightweight = stripImageDataFunc(bookmark);
      return {
        id: lightweight.id,
        url: lightweight.url,
        title: lightweight.title,
        description: lightweight.description,
        slug: lightweight.slug, // REQUIRED field
        tags: Array.isArray(lightweight.tags) ? lightweight.tags.map(normalizeFunc) : [],
        dateBookmarked: lightweight.dateBookmarked,
        dateCreated: lightweight.dateCreated,
        dateUpdated: lightweight.dateUpdated,
        content: lightweight.content,
        logoData: null,
        isPrivate: lightweight.isPrivate || false,
        isFavorite: lightweight.isFavorite || false,
        readingTime: lightweight.readingTime,
        wordCount: lightweight.wordCount,
        ogTitle: undefined,
        ogDescription: undefined,
        ogImage: undefined,
        domain: lightweight.domain,
        ogImageExternal: undefined,
      };
    }

    // When includeImageData is true, use full data conversion
    return {
      id: bookmark.id,
      url: bookmark.url,
      title: bookmark.title,
      description: bookmark.description,
      slug: bookmark.slug, // REQUIRED field
      tags: Array.isArray(bookmark.tags) ? bookmark.tags.map(normalizeFunc) : [],
      dateBookmarked: bookmark.dateBookmarked,
      dateCreated: bookmark.dateCreated,
      dateUpdated: bookmark.dateUpdated,
      content: bookmark.content,
      ogImage: bookmark.ogImage,
      ogImageExternal: bookmark.ogImageExternal,
      logoData: bookmark.logoData
        ? {
            url: bookmark.logoData.url,
            alt: bookmark.logoData.alt || "Logo",
            width: bookmark.logoData.width,
            height: bookmark.logoData.height,
          }
        : null,
      isPrivate: bookmark.isPrivate || false,
      isFavorite: bookmark.isFavorite || false,
      readingTime: bookmark.readingTime,
      wordCount: bookmark.wordCount,
      ogTitle: bookmark.ogTitle ?? undefined,
      ogDescription: bookmark.ogDescription ?? undefined,
      domain: bookmark.domain,
    };
  });

  // Pass the processed data to the client component with explicit typing
  const includesAll = serializableBookmarks.length === totalCount;
  return (
    <BookmarksClientWithWindow
      bookmarks={serializableBookmarks}
      title={title ?? ""}
      description={description ?? ""}
      searchAllBookmarks={!includesAll}
      showFilterBar={showFilterBar}
      titleSlug={titleSlug}
      initialPage={initialPage}
      totalPages={totalPages}
      totalCount={totalCount}
      baseUrl={baseUrl}
      usePagination={usePagination}
      initialTag={initialTag}
      tag={tag}
      internalHrefs={Object.fromEntries(internalHrefs)}
    />
  );
}
