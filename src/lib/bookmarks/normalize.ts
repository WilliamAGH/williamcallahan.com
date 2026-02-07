/**
 * Bookmark Normalization Module
 *
 * Handles transformation of raw API bookmark data into normalized UnifiedBookmark format
 *
 * @module lib/bookmarks/normalize
 */

import type { RawApiBookmark, UnifiedBookmark, BookmarkContent } from "@/types/bookmark";
import { omitHtmlContent } from "./utils";
import { envLogger } from "@/lib/utils/env-logger";
import { processSummaryText, removeCitations } from "@/lib/utils/formatters";

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

    const unifiedContent: BookmarkContent = {
      ...(raw.content ? omitHtmlContent(raw.content) : {}),
      type: raw.content?.type ?? "link",
      url: raw.content?.url || "",
      title: bestTitle || "Untitled Bookmark",
      description: bestDescription || "No description available.",
      // Populate missing asset IDs for fallback rendering
      screenshotAssetId: raw.content?.screenshotAssetId ?? screenshotAsset?.id,
      imageAssetId: raw.content?.imageAssetId ?? bannerAsset?.id,
    };

    return {
      id: raw.id,
      slug: "", // Slug will be added by slug manager
      url: raw.content?.url || "",
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
      taggingStatus: raw.taggingStatus,
      // Process note: remove citations but keep as single paragraph
      note: raw.note ? removeCitations(raw.note) : raw.note,
      // Process summary: remove citations and add paragraph breaks every 2 sentences
      summary: raw.summary ? processSummaryText(raw.summary) : raw.summary,
      content: unifiedContent,
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
    return null;
  }
}

/**
 * Normalizes an array of raw bookmarks
 *
 * @param rawBookmarks - Array of raw bookmarks from API
 * @returns Array of normalized bookmarks (nulls filtered out)
 */
export function normalizeBookmarks(rawBookmarks: RawApiBookmark[]): UnifiedBookmark[] {
  return rawBookmarks
    .map((raw, index) => normalizeBookmark(raw, index))
    .filter((bookmark): bookmark is UnifiedBookmark => bookmark !== null);
}
