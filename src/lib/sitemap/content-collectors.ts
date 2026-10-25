/**
 * Thought Sitemap Collector
 * @module lib/sitemap/content-collectors
 * @description
 * Collects sitemap entries for published thought pages. Book detail pages are
 * excluded from search indexing (`lib/seo/search-exclusion`).
 */

import type { MetadataRoute } from "next";

import { getThoughtListItems } from "@/lib/thoughts/service.server";

import { THOUGHT_CHANGE_FREQUENCY, THOUGHT_PRIORITY } from "@/lib/sitemap/constants";
import { sanitizePathSegment, handleSitemapCollectorError } from "@/lib/sitemap/date-utils";
import { getSafeDate, getLatestDate } from "@/lib/utils/date-format";

export const collectThoughtSitemapData = async (
  siteUrl: string,
): Promise<{
  entries: MetadataRoute.Sitemap;
  latestThoughtUpdateTime?: Date;
}> => {
  try {
    const thoughts = await getThoughtListItems();
    if (!Array.isArray(thoughts) || thoughts.length === 0) {
      return { entries: [], latestThoughtUpdateTime: undefined };
    }

    let latestDate: Date | undefined;
    const entries: MetadataRoute.Sitemap = [];

    for (const thought of thoughts) {
      if (thought.draft) continue;

      // Sanitize and validate slug to prevent malformed URLs
      const sanitizedSlug = sanitizePathSegment(thought.slug);
      if (!sanitizedSlug) {
        console.warn(`[Sitemap] Skipping thought with empty/unsafe slug: ${thought.slug}`);
        continue;
      }

      const lastModified = getLatestDate(
        getSafeDate(thought.updatedAt),
        getSafeDate(thought.createdAt),
      );
      latestDate = getLatestDate(latestDate, lastModified);

      // Only include lastModified if defined (prevents empty <lastmod> tags)
      const entry: MetadataRoute.Sitemap[number] = {
        url: `${siteUrl}/thoughts/${encodeURIComponent(sanitizedSlug)}`,
        changeFrequency: THOUGHT_CHANGE_FREQUENCY,
        priority: THOUGHT_PRIORITY,
      };
      if (lastModified) {
        entry.lastModified = lastModified;
      }
      entries.push(entry);
    }

    return {
      entries,
      latestThoughtUpdateTime: latestDate,
    };
  } catch (error) {
    return handleSitemapCollectorError(
      "Failed to collect thought sitemap entries",
      error,
      {
        entries: [],
        latestThoughtUpdateTime: undefined,
      },
      "throw-in-production",
    );
  }
};
