/**
 * @file Validation utilities for bookmarks data.
 * This module provides functions to validate bookmarks datasets to prevent
 * accidental overwrites with invalid or test data during refresh operations.
 * @module lib/validators/bookmarks
 */

import type { UnifiedBookmark } from "@/types";
import { z } from "zod";

/**
 * Validates a bookmarks dataset to ensure it is not obviously invalid or test data.
 * This function checks for suspicious single test bookmarks and datasets where all
 * bookmarks are missing URLs, providing detailed logging for debugging purposes.
 *
 * @param {UnifiedBookmark[]} bookmarks - The array of bookmarks to validate.
 * @returns {{ isValid: boolean; reason?: string }} An object indicating if the dataset is valid and a reason if it's not.
 */
export function validateBookmarksDataset(bookmarks: UnifiedBookmark[]): {
  isValid: boolean;
  reason?: string;
} {
  // Check for suspicious single test bookmark
  const isSuspiciousSingleTest = bookmarks.length === 1 && /test bookmark/i.test(bookmarks[0]?.title ?? "");
  if (isSuspiciousSingleTest) {
    const reason = `Single test bookmark detected with title: ${bookmarks[0]?.title || "N/A"}`;
    console.error(
      "[validateBookmarksDataset][SAFEGUARD] Refusing to overwrite bookmarks.json in S3 – dataset failed validation checks.",
    );
    console.error(`[validateBookmarksDataset][SAFEGUARD] Reason: ${reason}`);
    return { isValid: false, reason };
  }

  // Check if all bookmarks are missing URLs
  const isAllMissingUrls = bookmarks.length > 0 && bookmarks.every((b) => !b.url);
  if (isAllMissingUrls) {
    const reason = "All bookmarks missing URLs";
    console.error(
      "[validateBookmarksDataset][SAFEGUARD] Refusing to overwrite bookmarks.json in S3 – dataset failed validation checks.",
    );
    console.error(
      `[validateBookmarksDataset][SAFEGUARD] Reason: ${reason}. Sample bookmark IDs: ${
        bookmarks
          .slice(0, 3)
          .map((b) => b.id)
          .join(", ") || "N/A"
      }`,
    );
    // Detailed logging for missing URLs to aid root cause analysis
    const missingUrlCount = bookmarks.filter((b) => !b.url).length;
    console.error(
      `[validateBookmarksDataset][SAFEGUARD][DETAILED] Total bookmarks with missing URLs: ${missingUrlCount}`,
    );
    if (missingUrlCount <= 5) {
      console.error(
        "[validateBookmarksDataset][SAFEGUARD][DETAILED] Bookmarks with missing URLs (ID, Title):",
        bookmarks
          .filter((b) => !b.url)
          .map((b) => `ID: ${b.id}, Title: ${b.title || "N/A"}`)
          .join("; "),
      );
    } else {
      console.error(
        "[validateBookmarksDataset][SAFEGUARD][DETAILED] First 5 bookmarks with missing URLs (ID, Title):",
        bookmarks
          .filter((b) => !b.url)
          .slice(0, 5)
          .map((b) => `ID: ${b.id}, Title: ${b.title || "N/A"}`)
          .join("; "),
      );
    }
    return { isValid: false, reason };
  }

  // Dataset passes the earlier URL checks; now enforce minimum size in production
  const MIN_PRODUCTION_COUNT = Number.parseInt(process.env.MIN_BOOKMARKS_THRESHOLD ?? "10", 10);
  if (process.env.NODE_ENV === "production" && bookmarks.length < MIN_PRODUCTION_COUNT) {
    const reason = `Dataset too small: only ${bookmarks.length} bookmark(s), minimum expected is ${MIN_PRODUCTION_COUNT}`;
    console.error(
      "[validateBookmarksDataset][SAFEGUARD] Refusing to overwrite bookmarks.json in S3 – dataset failed minimum size check.",
    );
    console.error(`[validateBookmarksDataset][SAFEGUARD] Reason: ${reason}`);
    return { isValid: false, reason };
  }

  // Dataset passes validation
  return { isValid: true };
}

/**
 * Bookmarks Validator
 *
 * SCOPE: Zod validation schemas for bookmark data structures.
 */
export const BookmarkAssetSchema = z.object({
  id: z.string(),
  assetType: z.string(),
});

export const RawApiBookmarkTagSchema = z.object({
  id: z.string(),
  name: z.string(),
  attachedBy: z.string(),
});

export const RawApiBookmarkContentSchema = z.object({
  type: z.string(),
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().optional(),
  imageAssetId: z.string().optional(),
  screenshotAssetId: z.string().optional(),
  favicon: z.string().optional(),
  htmlContent: z.string().optional(),
  crawledAt: z.string().optional(),
  author: z.string().nullable().optional(),
  publisher: z.string().nullable().optional(),
  datePublished: z.string().nullable().optional(),
  dateModified: z.string().nullable().optional(),
});

export const RawApiBookmarkSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  title: z.string().nullable(),
  archived: z.boolean(),
  favourited: z.boolean(),
  taggingStatus: z.string(),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  tags: z.array(RawApiBookmarkTagSchema),
  content: RawApiBookmarkContentSchema,
  assets: z.array(BookmarkAssetSchema),
});

export const BookmarksApiResponseSchema = z.object({
  bookmarks: z.array(RawApiBookmarkSchema),
  nextCursor: z.string().nullable(),
});

// Helper function to validate API responses
export function validateBookmarksApiResponse(data: unknown) {
  return BookmarksApiResponseSchema.parse(data);
}
