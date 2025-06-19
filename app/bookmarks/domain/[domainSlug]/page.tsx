/**
 * Legacy Domain-based Bookmark Page Redirector
 *
 * Redirects from old domain-based URLs to the new slug-based URLs.
 *
 * @module app/bookmarks/domain/[domainSlug]/page
 */

// Configure dynamic rendering
export const dynamic = "force-dynamic";

import { getBookmarksForStaticBuild } from "@/lib/bookmarks/bookmarks.server";
import { generateUniqueSlug, getDomainSlug } from "@/lib/utils/domain-utils";
import { redirect } from "next/navigation";

/**
 * No static params for this page as it's just a redirector
 */

import type { DomainPageRedirectorProps } from "@/types";

export default async function DomainPageRedirector({ params, searchParams }: DomainPageRedirectorProps) {
  const allBookmarks = await getBookmarksForStaticBuild();
  // Make sure to await the params object
  const paramsResolved = await Promise.resolve(params);
  const { domainSlug } = paramsResolved;
  const searchParamsResolved = await Promise.resolve(searchParams);
  const rawId = searchParamsResolved.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  // If ID is provided, find that specific bookmark
  if (id) {
    const bookmark = allBookmarks.find((b) => b.id === id);
    if (bookmark) {
      const uniqueSlug = generateUniqueSlug(bookmark.url, allBookmarks, bookmark.id);
      redirect(`/bookmarks/${uniqueSlug}`);
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
    const uniqueSlug = generateUniqueSlug(bookmarkWithDomain.url, allBookmarks, bookmarkWithDomain.id);
    redirect(`/bookmarks/${uniqueSlug}`);
  }

  // If no match found, redirect to the main bookmarks page
  redirect("/bookmarks");
}
