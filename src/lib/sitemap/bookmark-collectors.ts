/**
 * Last-modified time of the /bookmarks hub. Detail and tag pages remain
 * excluded from the sitemap by the existing search-exclusion policy.
 */
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { handleSitemapCollectorError } from "@/lib/sitemap/date-utils";
import { getSafeDate } from "@/lib/utils/date-format";

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
