/**
 * Book & Thought Sitemap Collectors
 * @module lib/sitemap/content-collectors
 * @description
 * Collects sitemap entries for individual book detail pages and thought pages.
 */

import type { MetadataRoute } from "next";

import { fetchBooks } from "@/lib/books/books-data-access.server";
import { generateBookSlug } from "@/lib/books/slug-helpers";
import { getThoughtListItems } from "@/lib/thoughts/service.server";
import { PAGE_METADATA } from "@/data/metadata";

import {
  BOOK_CHANGE_FREQUENCY,
  BOOK_PRIORITY,
  THOUGHT_CHANGE_FREQUENCY,
  THOUGHT_PRIORITY,
} from "@/lib/sitemap/constants";
import {
  sanitizePathSegment,
  getSafeDate,
  getLatestDate,
  handleSitemapCollectorError,
} from "@/lib/sitemap/date-utils";

export const collectBookSitemapData = async (
  siteUrl: string,
): Promise<{
  entries: MetadataRoute.Sitemap;
  latestBookUpdateTime?: Date;
}> => {
  try {
    const books = await fetchBooks();
    if (!Array.isArray(books) || books.length === 0) {
      return { entries: [], latestBookUpdateTime: undefined };
    }

    const entries: MetadataRoute.Sitemap = books.map((book) => {
      const slug = generateBookSlug(book.title, book.id, book.authors, book.isbn13, book.isbn10);
      return {
        url: `${siteUrl}/books/${slug}`,
        changeFrequency: BOOK_CHANGE_FREQUENCY,
        priority: BOOK_PRIORITY,
      } satisfies MetadataRoute.Sitemap[number];
    });

    return {
      entries,
      latestBookUpdateTime: getSafeDate(PAGE_METADATA.books?.dateModified),
    };
  } catch (error) {
    return handleSitemapCollectorError("Failed to collect book sitemap entries", error, {
      entries: [],
      latestBookUpdateTime: undefined,
    });
  }
};

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
    return handleSitemapCollectorError("Failed to collect thought sitemap entries", error, {
      entries: [],
      latestThoughtUpdateTime: undefined,
    });
  }
};
