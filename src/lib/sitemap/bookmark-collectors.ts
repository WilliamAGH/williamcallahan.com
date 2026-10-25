/**
 * Bookmark Sitemap Collector
 * @module lib/sitemap/bookmark-collectors
 * @description
 * Resolves the last-modified time of the /bookmarks listing. Bookmark detail
 * and tag pages are excluded from search indexing (`lib/seo/search-exclusion`),
 * so the sitemap lists only the listing itself.
 */

import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { getSafeDate, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";

export const collectBookmarksLastModified = async (): Promise<Date | undefined> => {
  try {
    const index = await getBookmarksIndex();
    return getSafeDate(index?.lastModified);
  } catch (error) {
    return handleSitemapCollectorError(
      "Failed to read the bookmark index",
      error,
      undefined,
      "throw-in-production",
    );
  }
};
