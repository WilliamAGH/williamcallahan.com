/**
 * Last-modified time of the /bookmarks hub and graduated bookmark entries
 * for the separate /bookmarks-sitemap.xml sitemap.
 */
import type { MetadataRoute } from "next";
import { metadata as siteMetadata } from "@/data/metadata";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { getBookmarksIndex } from "@/lib/bookmarks/service.server";
import { handleSitemapCollectorError } from "@/lib/sitemap/date-utils";
import { getSafeDate } from "@/lib/utils/date-format";

const TAG_HUB_SITEMAP_PRIORITY = 0.7;
const BOOKMARK_DETAIL_SITEMAP_PRIORITY = 0.65;

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

export const collectGraduatedBookmarksSitemapEntries = async (
  siteUrl?: string,
): Promise<MetadataRoute.Sitemap> => {
  const baseUrl = (siteUrl ?? siteMetadata.site.url).replace(/\/+$/, "");
  try {
    const { listGraduatedTagHubSitemapEntries, listGraduatedBookmarkSitemapEntries } =
      await import("@/lib/db/queries/bookmark-seo");
    const [hubs, bookmarks] = await Promise.all([
      listGraduatedTagHubSitemapEntries(),
      listGraduatedBookmarkSitemapEntries(),
    ]);
    const hubEntries = hubs.map((hub) => ({
      url: `${baseUrl}/bookmarks/tags/${encodeURIComponent(hub.tagSlug)}`,
      lastModified: getSafeDate(hub.lastModified),
      changeFrequency: "weekly" as const,
      priority: TAG_HUB_SITEMAP_PRIORITY,
    }));
    const bookmarkEntries = bookmarks.map((entry) => ({
      url: `${baseUrl}${buildBookmarkPath(entry.slug)}`,
      lastModified: getSafeDate(entry.lastModified),
      changeFrequency: "monthly" as const,
      priority: BOOKMARK_DETAIL_SITEMAP_PRIORITY,
    }));
    return [...hubEntries, ...bookmarkEntries];
  } catch (error) {
    const emptyEntries: MetadataRoute.Sitemap = [];
    return handleSitemapCollectorError(
      "Failed to collect graduated bookmark sitemap entries",
      error,
      emptyEntries,
      "throw-in-production",
    );
  }
};
