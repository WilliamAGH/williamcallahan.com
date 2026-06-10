/**
 * Bookmark Normalization Module
 *
 * Handles transformation of raw API bookmark data into normalized UnifiedBookmark format
 *
 * @module lib/bookmarks/normalize
 */

import {
  unifiedBookmarkSchema,
  type RawApiBookmark,
  type UnifiedBookmark,
  type BookmarkContent,
} from "@/types/schemas/bookmark";
import { envLogger } from "@/lib/utils/env-logger";
import { processSummaryText, removeCitations } from "@/lib/utils/formatters";
import { extractDomainWithoutWww } from "@/lib/utils/url-utils";
import { normalizeScrapedContentText } from "./scraped-content";

const READING_SPEED_WPM = 200;

export class BookmarkNormalizationError extends Error {
  constructor(failures: Array<{ id: string; index: number }>) {
    const rejected = failures
      .map((failure) => `${failure.id} at index ${failure.index}`)
      .join(", ");
    super(
      `[BookmarksNormalize] Refusing partial refresh; ${failures.length} bookmark(s) failed normalization: ${rejected}`,
    );
    this.name = "BookmarkNormalizationError";
  }
}

function computeWordCount(text: string | null | undefined): number | undefined {
  if (typeof text !== "string" || text.trim().length === 0) return undefined;
  const words = text.trim().split(/\s+/);
  return words.length;
}

function computeReadingTime(wordCount: number | undefined): number | undefined {
  if (wordCount === undefined || wordCount === 0) return undefined;
  return Math.ceil(wordCount / READING_SPEED_WPM);
}

function parseAttachedBy(value: string | undefined): "user" | "ai" | undefined {
  if (value === "user") return "user";
  if (value === "ai") return "ai";
  return undefined;
}

/**
 * Normalizes a raw bookmark from the API into a UnifiedBookmark
 *
 * @param raw - Raw bookmark data from external API
 * @param index - Index in the array for debugging
 * @returns Normalized UnifiedBookmark or null if invalid
 */
export function normalizeBookmark(raw: RawApiBookmark, index: number): UnifiedBookmark | null {
  if (!raw || typeof raw !== "object") {
    envLogger.log(
      `Invalid raw bookmark data`,
      { index, rawType: typeof raw },
      { category: "BookmarksNormalize" },
    );
    return null;
  }

  try {
    const bestTitle = raw.title || raw.content?.title || "Untitled Bookmark";
    // Prefer backend-provided description over summary to avoid AI text overriding clean descriptions
    const bestDescription = raw.content?.description || raw.summary || "No description available.";
    // Extract raw HTML for text normalization; access via index since it's not in the Zod schema
    const rawHtml = raw.content?.htmlContent;
    const scrapedContentText = normalizeScrapedContentText(
      typeof rawHtml === "string" ? rawHtml : null,
    );
    const bookmarkUrlResult = unifiedBookmarkSchema.shape.url.safeParse(raw.content.url);
    if (!bookmarkUrlResult.success) {
      envLogger.log(
        "Skipping bookmark with invalid URL",
        {
          index,
          bookmarkId: raw.id,
          issues: bookmarkUrlResult.error.issues,
        },
        { category: "BookmarksNormalize" },
      );
      return null;
    }
    const bookmarkUrl = bookmarkUrlResult.data;
    const domainCandidate = bookmarkUrl ? extractDomainWithoutWww(bookmarkUrl) : "";
    const domain = domainCandidate && domainCandidate !== bookmarkUrl ? domainCandidate : undefined;
    const wordCount = computeWordCount(scrapedContentText);
    const readingTime = computeReadingTime(wordCount);

    const normalizedTags = Array.isArray(raw.tags)
      ? raw.tags.map((tag) => ({
          id: tag.id,
          name: tag.name,
          slug: tag.name.toLowerCase().replaceAll(/\s+/g, "-"),
          attachedBy: parseAttachedBy(tag.attachedBy),
        }))
      : [];

    // Include asset IDs from raw.assets if raw.content fields are missing
    const screenshotAsset = raw.assets?.find((asset) => asset.assetType === "screenshot");
    const bannerAsset = raw.assets?.find((asset) => asset.assetType === "bannerImage");

    // Explicitly list content properties — raw HTML is NOT carried to PostgreSQL
    const unifiedContent: BookmarkContent = {
      type: raw.content?.type ?? "link",
      url: bookmarkUrl,
      title: bestTitle || "Untitled Bookmark",
      description: bestDescription || "No description available.",
      contentAssetId: raw.content?.contentAssetId,
      crawlStatus: raw.content?.crawlStatus,
      imageUrl: raw.content?.imageUrl,
      imageAssetId: raw.content?.imageAssetId ?? bannerAsset?.id,
      screenshotAssetId: raw.content?.screenshotAssetId ?? screenshotAsset?.id,
      favicon: raw.content?.favicon,
      crawledAt: raw.content?.crawledAt,
      author: raw.content?.author,
      publisher: raw.content?.publisher,
      datePublished: raw.content?.datePublished,
      dateModified: raw.content?.dateModified,
    };

    return {
      id: raw.id,
      slug: "", // Slug will be added by slug manager
      url: bookmarkUrl,
      domain,
      title: bestTitle,
      description: bestDescription,
      tags: normalizedTags,
      ogImage: raw.content?.imageUrl || undefined, // Will be enhanced with OpenGraph data
      dateBookmarked: raw.createdAt,
      datePublished: raw.content?.datePublished,
      dateCreated: raw.createdAt,
      modifiedAt: raw.modifiedAt,
      archived: raw.archived,
      isFavorite: raw.favourited,
      taggingStatus: raw.taggingStatus ?? undefined,
      // Process note: remove citations but keep as single paragraph
      note: raw.note ? removeCitations(raw.note) : raw.note,
      // Process summary: remove citations and add paragraph breaks every 2 sentences
      summary: raw.summary ? processSummaryText(raw.summary) : raw.summary,
      content: unifiedContent,
      scrapedContentText: scrapedContentText ?? undefined,
      wordCount,
      readingTime,
      assets: Array.isArray(raw.assets) ? raw.assets : [],

      // Add new fields for selective refresh
      sourceUpdatedAt: raw.modifiedAt,
      ogImageLastFetchedAt: undefined,
      ogImageEtag: undefined,
    };
  } catch (normError) {
    envLogger.log(
      "Error normalizing bookmark",
      {
        index,
        bookmarkId: raw?.id ?? "N/A",
        // Avoid logging full raw object to reduce PII leakage
        error: normError instanceof Error ? normError.message : String(normError),
      },
      { category: "BookmarksNormalize" },
    );
    // RC1a: error logged; null is the documented contract (callers filter nulls)
  }
  return null;
}

/**
 * Normalizes an array of raw bookmarks
 *
 * @param rawBookmarks - Array of raw bookmarks from API
 * @returns Array of normalized bookmarks
 * @throws BookmarkNormalizationError if any bookmark fails normalization
 */
export function normalizeBookmarks(rawBookmarks: RawApiBookmark[]): UnifiedBookmark[] {
  const normalizedBookmarks: UnifiedBookmark[] = [];
  const failures: Array<{ id: string; index: number }> = [];

  rawBookmarks.forEach((raw, index) => {
    const bookmark = normalizeBookmark(raw, index);
    if (bookmark) {
      normalizedBookmarks.push(bookmark);
    } else {
      failures.push({ id: raw.id, index });
    }
  });

  if (failures.length > 0) {
    throw new BookmarkNormalizationError(failures);
  }

  return normalizedBookmarks;
}
