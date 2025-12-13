/**
 * Book Image Utilities
 * @module lib/books/image-utils
 * @description
 * Server-side utilities for book cover image processing.
 * Generates blur placeholders (LQIP) for cover images.
 */

import { getPlaiceholder } from "plaiceholder";
import { fetchWithTimeout } from "@/lib/utils/http-client";

const isDevLoggingEnabled =
  process.env.NODE_ENV === "development" || process.env.DEBUG === "true" || process.env.VERBOSE === "true";

/**
 * Generate a blur data URL (LQIP) for a book cover image.
 * Used as the blurDataURL prop for Next.js Image component's placeholder="blur".
 *
 * @param coverUrl - The URL of the cover image (including auth token)
 * @returns Base64-encoded blur data URL or undefined if generation fails
 */
export async function generateBookCoverBlur(coverUrl: string): Promise<string | undefined> {
  if (!coverUrl) return undefined;

  try {
    const response = await fetchWithTimeout(coverUrl, {
      timeout: 10000,
      headers: {
        Accept: "image/*",
      },
    });

    if (!response.ok) {
      if (isDevLoggingEnabled) {
        console.warn(`[generateBookCoverBlur] Failed to fetch cover: ${response.status} ${coverUrl}`);
      }
      return undefined;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate a tiny 10x10 blur placeholder
    const { base64 } = await getPlaiceholder(buffer, { size: 10 });
    return base64;
  } catch (error) {
    if (isDevLoggingEnabled) {
      console.warn(`[generateBookCoverBlur] Error generating blur for ${coverUrl}:`, error);
    }
    return undefined;
  }
}

/**
 * Batch generate blur data URLs for multiple cover images.
 * Uses Promise.allSettled for resilience - failures don't block other images.
 *
 * @param coverUrls - Map of item ID to cover URL
 * @returns Map of item ID to blur data URL (undefined for failures)
 */
export async function generateBookCoverBlursInBatch(
  coverUrls: Map<string, string>,
): Promise<Map<string, string | undefined>> {
  const entries = Array.from(coverUrls.entries());

  const results = await Promise.allSettled(
    entries.map(async ([id, url]) => {
      const blur = await generateBookCoverBlur(url);
      return [id, blur] as const;
    }),
  );

  const blurMap = new Map<string, string | undefined>();

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [id, blur] = result.value;
      blurMap.set(id, blur);
    }
  }

  return blurMap;
}
