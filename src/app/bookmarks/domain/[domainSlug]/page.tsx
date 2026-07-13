/**
 * Legacy Domain-based Bookmark Page Redirector
 *
 * Redirects from old domain-based URLs to the new slug-based URLs.
 *
 * @module app/bookmarks/domain/[domainSlug]/page
 */

import { connection } from "next/server";
import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { getDomainSlug } from "@/lib/utils/domain-utils";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";
import { redirect } from "next/navigation";

import type { DomainPageRedirectorProps } from "@/types/api";

export default async function DomainPageRedirector({
  params,
  searchParams,
}: DomainPageRedirectorProps) {
  // Ensure request-time execution - this redirector uses searchParams and dynamic data
  await connection();

  const allBookmarks = await getBookmarks({
    ...DEFAULT_BOOKMARK_OPTIONS,
    includeImageData: false,
    skipExternalFetch: false,
    force: false,
  });

  // Load slug mapping - REQUIRED for idempotency
  const slugMapping = await loadSlugMapping();
  if (!slugMapping) {
    console.error("[DomainRedirect] CRITICAL: No slug mapping found");
    redirect("/bookmarks"); // Fallback to main bookmarks page
  }

  const { domainSlug } = await params;
  const { id: rawId } = await searchParams;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  // If ID is provided, find that specific bookmark
  if (id) {
    const bookmark = allBookmarks.find((b) => b.id === id);
    if (bookmark) {
      const uniqueSlug = getSlugForBookmark(slugMapping, bookmark.id);
      if (uniqueSlug) {
        redirect(buildBookmarkPath(uniqueSlug));
      } else {
        console.error(`[DomainRedirect] No slug found for bookmark ${bookmark.id}`);
      }
    }
  }

  // Otherwise, find the first bookmark matching this domain
  const bookmarkWithDomain = allBookmarks.find((bookmark) => {
    try {
      return getDomainSlug(bookmark.url) === domainSlug;
    } catch {
      return false;
    }
  });

  if (bookmarkWithDomain) {
    const uniqueSlug = getSlugForBookmark(slugMapping, bookmarkWithDomain.id);
    if (uniqueSlug) {
      redirect(buildBookmarkPath(uniqueSlug));
    } else {
      console.error(`[DomainRedirect] No slug found for bookmark ${bookmarkWithDomain.id}`);
    }
  }

  // If no match found, redirect to the main bookmarks page
  redirect("/bookmarks");
}
