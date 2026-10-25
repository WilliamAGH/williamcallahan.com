/**
 * Bookmark & Tag Sitemap Collectors
 * @module lib/sitemap/bookmark-collectors
 * @description
 * Collects sitemap entries from compact bookmark/date projections and canonical tags.
 */

import type { MetadataRoute } from "next";

import { listBookmarkTagSlugs, listCanonicalTagPageCounts } from "@/lib/bookmarks/service.server";
import { getBookmarkSitemapRowsFromDatabase } from "@/lib/db/queries/bookmarks";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { resolveBookmarkLastModified } from "@/lib/bookmarks/content-dates";
import { getSafeDate, getLatestDate } from "@/lib/utils/date-format";

import {
  BOOKMARK_CHANGE_FREQUENCY,
  BOOKMARK_PRIORITY,
  BOOKMARK_TAG_PRIORITY,
  BOOKMARK_TAG_PAGE_PRIORITY,
} from "@/lib/sitemap/constants";
import { sanitizePathSegment, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";

export const collectBookmarkSitemapData = async (
  siteUrl: string,
): Promise<{
  entries: MetadataRoute.Sitemap;
  latestBookmarkUpdateTime?: Date;
}> => {
  try {
    const bookmarks = await getBookmarkSitemapRowsFromDatabase();
    let latestBookmarkUpdateTime: Date | undefined;
    const entries: MetadataRoute.Sitemap = [];
    for (const bookmark of bookmarks) {
      if (!bookmark.slug) continue;
      const lastModified = resolveBookmarkLastModified(bookmark);
      latestBookmarkUpdateTime = getLatestDate(latestBookmarkUpdateTime, lastModified);
      entries.push({
        url: `${siteUrl}${buildBookmarkPath(bookmark.slug)}`,
        lastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_PRIORITY,
      });
    }
    return {
      entries,
      latestBookmarkUpdateTime,
    };
  } catch (error) {
    return handleSitemapCollectorError(
      "Failed to collect bookmark sitemap entries",
      error,
      {
        entries: [],
        latestBookmarkUpdateTime: undefined,
      },
      "throw-in-production",
    );
  }
};

export const collectTagSitemapData = async (
  siteUrl: string,
): Promise<{
  tagEntries: MetadataRoute.Sitemap;
  paginatedTagEntries: MetadataRoute.Sitemap;
}> => {
  try {
    const tagSlugs = await listBookmarkTagSlugs();
    if (tagSlugs.length === 0) {
      return { tagEntries: [], paginatedTagEntries: [] };
    }

    const tagEntries: MetadataRoute.Sitemap = [];
    const paginatedTagEntries: MetadataRoute.Sitemap = [];

    // One grouped query yields every canonical tag's page count, so paginated
    // tag URLs are always emitted regardless of how many tags exist.
    const tagPageCounts = await listCanonicalTagPageCounts();
    const pageCountsBySlug = new Map(tagPageCounts.map((row) => [row.tagSlug, row]));

    for (const rawSlug of tagSlugs) {
      // Tags with zero bookmarks are absent from the grouped counts; their
      // route 404s, so the sitemap must not advertise them.
      const pageCount = pageCountsBySlug.get(rawSlug);
      if (!pageCount) {
        continue;
      }
      const sanitizedSlug = sanitizePathSegment(rawSlug);
      const baseUrl = `${siteUrl}/bookmarks/tags/${sanitizedSlug}`;
      const tagLastModified = getSafeDate(pageCount.lastModified);

      tagEntries.push({
        url: baseUrl,
        lastModified: tagLastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_TAG_PRIORITY,
      });

      for (let page = 2; page <= pageCount.totalPages; page++) {
        paginatedTagEntries.push({
          url: `${baseUrl}/page/${page}`,
          lastModified: tagLastModified,
          changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
          priority: BOOKMARK_TAG_PAGE_PRIORITY,
        });
      }
    }

    return { tagEntries, paginatedTagEntries };
  } catch (error) {
    return handleSitemapCollectorError(
      "Failed to collect bookmark tag sitemap entries",
      error,
      {
        tagEntries: [],
        paginatedTagEntries: [],
      },
      "throw-in-production",
    );
  }
};
