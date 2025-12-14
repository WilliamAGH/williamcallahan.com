/**
 * Book Image Utilities
 * @module lib/books/image-utils
 * @description
 * Server-side utilities for book cover image processing.
 * Generates blur placeholders (LQIP) for cover images.
 */

import { getPlaiceholder } from "plaiceholder";
import { fetchWithTimeout } from "@/lib/utils/http-client";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";

const BLUR_FETCH_TIMEOUT_MS = 12_000;
const BLUR_CONCURRENCY = 3;

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
    const imageService = getUnifiedImageService();
    const result = await imageService.getImage(coverUrl, {
      forceRefresh: true,
      type: "book-cover",
      retainBuffer: true,
      timeoutMs: BLUR_FETCH_TIMEOUT_MS,
      skipUpload: true, // Blur generation is read-only; do not persist blurs or source images
    });

    const buffer = result.buffer;
    if (!buffer || buffer.length === 0) {
      if (isDevLoggingEnabled) {
        console.warn(`[generateBookCoverBlur] No buffer returned from image service for ${coverUrl}`);
      }
      return undefined;
    }

    // Generate a tiny 10x10 blur placeholder
    const { base64 } = await getPlaiceholder(buffer, { size: 10 });
    return base64;
  } catch (primaryError) {
    // Fallback: direct fetch with extended timeout to reduce noisy timeouts
    if (isDevLoggingEnabled) {
      console.warn(`[generateBookCoverBlur] Primary method failed for ${coverUrl}:`, primaryError);
    }
    try {
      const response = await fetchWithTimeout(coverUrl, {
        timeout: BLUR_FETCH_TIMEOUT_MS,
        headers: {
          Accept: "image/*",
        },
      });

      if (!response.ok) {
        if (isDevLoggingEnabled) {
          console.warn(`[generateBookCoverBlur] Fallback fetch failed: ${response.status} ${coverUrl}`);
        }
        return undefined;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const { base64 } = await getPlaiceholder(buffer, { size: 10 });
      return base64;
    } catch (fallbackError) {
      if (isDevLoggingEnabled) {
        console.warn(`[generateBookCoverBlur] Error generating blur for ${coverUrl}:`, fallbackError);
      }
      return undefined;
    }
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
  const blurMap = new Map<string, string | undefined>();

  let index = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      const current = index++;
      const entry = entries[current];
      if (!entry) break;
      const [id, url] = entry;
      const blur = await generateBookCoverBlur(url);
      blurMap.set(id, blur);
    }
  };

  const workers = Array.from({ length: Math.min(BLUR_CONCURRENCY, entries.length) }, () => worker());
  await Promise.all(workers);

  return blurMap;
}
