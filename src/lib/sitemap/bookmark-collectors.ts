/**
 * Bookmark & Tag Sitemap Collectors
 * @module lib/sitemap/bookmark-collectors
 * @description
 * Collects sitemap entries for individual bookmarks (via slug mapping or
 * paginated fallback), paginated bookmark list pages, and bookmark tag pages.
 */

import type { MetadataRoute } from "next";

import {
  getBookmarksIndex,
  getBookmarksPage,
  listBookmarkTagSlugs,
  getTagBookmarksIndex,
} from "@/lib/bookmarks/service.server";
import { loadSlugMapping } from "@/lib/bookmarks/slug-manager";

import {
  BOOKMARK_CHANGE_FREQUENCY,
  BOOKMARK_PRIORITY,
  BOOKMARK_TAG_PRIORITY,
  BOOKMARK_TAG_PAGE_PRIORITY,
  TAG_INDEX_LOOKUP_BUDGET,
} from "@/lib/sitemap/constants";
import {
  sanitizePathSegment,
  getSafeDate,
  getLatestDate,
  resolveBookmarkLastModified,
  isTestEnvironment,
} from "@/lib/sitemap/date-utils";

export const buildPaginatedBookmarkEntries = (
  siteUrl: string,
  totalPages: number,
  latestBookmarkUpdateTime: Date | undefined,
): MetadataRoute.Sitemap => {
  const entries: MetadataRoute.Sitemap = [];
  for (let page = 2; page <= totalPages; page++) {
    const entry: MetadataRoute.Sitemap[number] = {
      url: `${siteUrl}/bookmarks/page/${page}`,
      changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
      priority: BOOKMARK_PRIORITY,
    };
    if (latestBookmarkUpdateTime) {
      entry.lastModified = latestBookmarkUpdateTime;
    }
    entries.push(entry);
  }
  return entries;
};

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
        url: `${siteUrl}/bookmarks/${sanitizePathSegment(slug)}`,
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
  paginatedEntries: MetadataRoute.Sitemap;
  latestBookmarkUpdateTime?: Date;
}> => {
  try {
    const [index, slugMapping] = await Promise.all([getBookmarksIndex(), loadSlugMapping()]);
    if (!index || !index.totalPages || index.totalPages < 1) {
      return {
        entries: [],
        paginatedEntries: [],
        latestBookmarkUpdateTime: undefined,
      };
    }

    const totalPages = Math.max(1, index.totalPages);
    const latestBookmarkUpdateTime = getSafeDate(index.lastModified);

    const bookmarkEntriesFromMapping: MetadataRoute.Sitemap | null =
      slugMapping && Object.keys(slugMapping.slugs).length > 0
        ? Object.values(slugMapping.slugs).map((entry) => ({
            url: `${siteUrl}/bookmarks/${sanitizePathSegment(entry.slug)}`,
            lastModified: latestBookmarkUpdateTime,
            changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
            priority: BOOKMARK_PRIORITY,
          }))
        : null;

    let bookmarkEntries: MetadataRoute.Sitemap = bookmarkEntriesFromMapping ?? [];
    if (bookmarkEntries.length === 0) {
      console.info(
        "[Sitemap] Slug mapping produced no bookmark entries; falling back to page collection",
      );
      const pageData = await collectBookmarkEntriesFromPages(siteUrl, totalPages);
      bookmarkEntries = pageData.entries;
    }

    const paginatedEntries = buildPaginatedBookmarkEntries(
      siteUrl,
      totalPages,
      latestBookmarkUpdateTime,
    );

    return {
      entries: bookmarkEntries,
      paginatedEntries,
      latestBookmarkUpdateTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Sitemap] Failed to collect bookmark sitemap entries:", message);

    if (isTestEnvironment()) {
      throw error;
    }

    return {
      entries: [],
      paginatedEntries: [],
      latestBookmarkUpdateTime: undefined,
    };
  }
};

export const collectTagSitemapData = async (
  siteUrl: string,
): Promise<{
  tagEntries: MetadataRoute.Sitemap;
  paginatedTagEntries: MetadataRoute.Sitemap;
}> => {
  const tagEntries: MetadataRoute.Sitemap = [];
  const paginatedTagEntries: MetadataRoute.Sitemap = [];

  try {
    const tagSlugs = await listBookmarkTagSlugs();
    if (tagSlugs.length === 0) {
      return { tagEntries, paginatedTagEntries };
    }

    if (tagSlugs.length > TAG_INDEX_LOOKUP_BUDGET) {
      console.warn(
        `[Sitemap] Tag slug count (${tagSlugs.length}) exceeded lookup budget (${TAG_INDEX_LOOKUP_BUDGET}); skipping per-tag index fetches for faster sitemap generation.`,
      );
      return {
        tagEntries: tagSlugs.map((rawSlug) => {
          const sanitizedSlug = sanitizePathSegment(rawSlug);
          return {
            url: `${siteUrl}/bookmarks/tags/${sanitizedSlug}`,
            changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
            priority: BOOKMARK_TAG_PRIORITY,
          } satisfies MetadataRoute.Sitemap[number];
        }),
        paginatedTagEntries: [],
      };
    }

    for (const rawSlug of tagSlugs) {
      const tagIndex = await getTagBookmarksIndex(rawSlug);
      if (!tagIndex) {
        continue;
      }

      const totalPages = Math.max(1, tagIndex.totalPages ?? 0);
      const sanitizedSlug = sanitizePathSegment(rawSlug);
      const baseUrl = `${siteUrl}/bookmarks/tags/${sanitizedSlug}`;
      const tagLastModified = getSafeDate(tagIndex.lastModified);

      tagEntries.push({
        url: baseUrl,
        lastModified: tagLastModified,
        changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
        priority: BOOKMARK_TAG_PRIORITY,
      });

      for (let page = 2; page <= totalPages; page++) {
        paginatedTagEntries.push({
          url: `${baseUrl}/page/${page}`,
          lastModified: tagLastModified,
          changeFrequency: BOOKMARK_CHANGE_FREQUENCY,
          priority: BOOKMARK_TAG_PAGE_PRIORITY,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Sitemap] Failed to collect bookmark tag sitemap entries:", message);

    if (isTestEnvironment()) {
      throw error;
    }

    return { tagEntries: [], paginatedTagEntries: [] };
  }

  return { tagEntries, paginatedTagEntries };
};
