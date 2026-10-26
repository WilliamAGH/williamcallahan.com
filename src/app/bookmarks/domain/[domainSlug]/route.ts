/**
 * Legacy Domain-based Bookmark Page Redirector
 *
 * Redirects from old domain-based URLs to the new slug-based URLs.
 *
 * @module app/bookmarks/domain/[domainSlug]/page
 */

import { getBookmarks } from "@/lib/bookmarks/service.server";
import { DEFAULT_BOOKMARK_OPTIONS } from "@/lib/constants";
import { getDomainSlug } from "@/lib/utils/domain-utils";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { loadSlugMapping, getSlugForBookmark } from "@/lib/bookmarks/slug-manager";

import type { DomainPageRedirectorProps } from "@/types/api";

export async function GET(
  request: Request,
  { params }: { params: DomainPageRedirectorProps["params"] },
): Promise<Response> {
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
    return new Response(null, { status: 307, headers: { Location: "/bookmarks" } });
  }

  const { domainSlug } = await params;
  const id = new URL(request.url).searchParams.get("id");

  // If ID is provided, find that specific bookmark
  if (id) {
    const bookmark = allBookmarks.find((b) => b.id === id);
    if (bookmark) {
      const uniqueSlug = getSlugForBookmark(slugMapping, bookmark.id);
      if (uniqueSlug) {
        return new Response(null, {
          status: 308,
          headers: { Location: buildBookmarkPath(uniqueSlug) },
        });
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
      return new Response(null, {
        status: 308,
        headers: { Location: buildBookmarkPath(uniqueSlug) },
      });
    } else {
      console.error(`[DomainRedirect] No slug found for bookmark ${bookmarkWithDomain.id}`);
    }
  }

  // If no match found, redirect to the main bookmarks page
  return new Response(null, { status: 308, headers: { Location: "/bookmarks" } });
}
