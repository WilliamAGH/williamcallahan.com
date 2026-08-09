/**
 * Bookmark & Tag Sitemap Collectors
 * @module lib/sitemap/bookmark-collectors
 * @description
 * Collects sitemap entries for individual bookmarks (via slug mapping or
 * paginated fallback) and bookmark tag pages.
 */

import type { MetadataRoute } from "next";

import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  listCanonicalTagPageCounts,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";

import {
  BOOKMARK_CHANGE_FREQUENCY,
  BOOKMARK_PRIORITY,
  BOOKMARK_TAG_PRIORITY,
  BOOKMARK_TAG_PAGE_PRIORITY,
} from "@/lib/sitemap/constants";
import {
  sanitizePathSegment,
  getSafeDate,
  getLatestDate,
  resolveBookmarkLastModified,
  handleSitemapCollectorError,
  isTestEnvironment,
} from "@/lib/sitemap/date-utils";

const collectBookmarkEntriesFromPages = async (
  siteUrl: string,
  totalPages: number,
): Promise<{
  entries: MetadataRoute.Sitemap;
  latestBookmarkUpdateTime?: Date;
}> => {
  const bookmarkEntries: MetadataRoute.Sitemap = [];
  let latestBookmarkUpdateTime: Date | undefined;

  for (let page = 1; page <= totalPages; page++) {
    const pageBookmarks = await getBookmarksPage(page);
    if (!Array.isArray(pageBookmarks) || pageBookmarks.length === 0) {
      continue;
    }

    for (const bookmark of pageBookmarks) {
      const slug = bookmark.slug;
      if (!slug) {
        console.warn(`[Sitemap] Skipping bookmark ${bookmark.id} because slug is missing.`);
        continue;
      }

      const lastModified = resolveBookmarkLastModified(bookmark);
      latestBookmarkUpdateTime = getLatestDate(latestBookmarkUpdateTime, lastModified);
      bookmarkEntries.push({
        url: `${siteUrl}${buildBookmarkPath(slug)}`,
        lastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_PRIORITY,
      });
    }
  }

  return { entries: bookmarkEntries, latestBookmarkUpdateTime };
};

export const collectBookmarkSitemapData = async (
  siteUrl: string,
): Promise<{
  entries: MetadataRoute.Sitemap;
  latestBookmarkUpdateTime?: Date;
}> => {
  try {
    const [index, slugMapping] = await Promise.all([getBookmarksIndex(), loadSlugMapping()]);
    if (!index || !index.totalPages || index.totalPages < 1) {
      return {
        entries: [],
        latestBookmarkUpdateTime: undefined,
      };
    }

    const totalPages = Math.max(1, index.totalPages);
    const latestBookmarkUpdateTime = getSafeDate(index.lastModified);

    const bookmarkEntriesFromMapping: MetadataRoute.Sitemap | null =
      slugMapping && Object.keys(slugMapping.slugs).length > 0
        ? Object.values(slugMapping.slugs).map((entry) => ({
            url: `${siteUrl}${buildBookmarkPath(entry.slug)}`,
            lastModified: latestBookmarkUpdateTime,
            changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
            priority: BOOKMARK_PRIORITY,
          }))
        : null;

    let bookmarkEntries: MetadataRoute.Sitemap = bookmarkEntriesFromMapping ?? [];
    if (bookmarkEntries.length === 0) {
      if (!isTestEnvironment()) {
        console.info(
          "[Sitemap] Slug mapping produced no bookmark entries; falling back to page collection",
        );
      }
      const pageData = await collectBookmarkEntriesFromPages(siteUrl, totalPages);
      bookmarkEntries = pageData.entries;
    }

    return {
      entries: bookmarkEntries,
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
