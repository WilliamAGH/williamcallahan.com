/**
 * Book Image Utilities
 * @module lib/books/image-utils
 * @description
 * Server-side utilities for book cover image processing.
 * Generates blur placeholders (LQIP) for cover images.
 */

import { getPlaiceholder } from "plaiceholder";
import { fetchWithTimeout } from "@/lib/utils/http-client";

const BLUR_FETCH_TIMEOUT_MS = 30_000;
const BLUR_CONCURRENCY = 3;

/**
 * Check if we're in build phase where blur generation should be skipped.
 * During prerendering, fetch() is aborted when the prerender completes,
 * causing noisy errors. Blur placeholders are a progressive enhancement
 * that can be generated at runtime instead.
 */
const PHASE_ENV_KEY = "NEXT_PHASE" as const;
const BUILD_PHASE_VALUE = "phase-production-build" as const;
const isBuildPhase = (): boolean => process.env[PHASE_ENV_KEY] === BUILD_PHASE_VALUE;

const isDevLoggingEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

function sanitizeUrlForLogs(url: string): string {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    return parsed.toString();
  } catch {
    const idx = url.indexOf("?");
    return idx === -1 ? url : url.slice(0, idx);
  }
}

/**
 * Generate a blur data URL (LQIP) for a book cover image.
 * Used as the blurDataURL prop for Next.js Image component's placeholder="blur".
 *
 * @param coverUrl - The URL of the cover image (including auth token)
 * @returns Base64-encoded blur data URL or undefined if generation fails
 */
export async function generateBookCoverBlur(coverUrl: string): Promise<string | undefined> {
  if (!coverUrl) return undefined;

  // Skip during build phase to avoid prerender abort errors.
  // Blur placeholders are a progressive enhancement - the page works without them.
  if (isBuildPhase()) {
    return undefined;
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
        console.warn(
          `[generateBookCoverBlur] Cover fetch failed: HTTP ${response.status} ${sanitizeUrlForLogs(coverUrl)}`,
        );
      }
      return undefined;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) return undefined;
    const { base64 } = await getPlaiceholder(buffer, { size: 10 });
    return base64;
  } catch (error) {
    if (isDevLoggingEnabled) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[generateBookCoverBlur] Error generating blur for ${sanitizeUrlForLogs(coverUrl)}: ${message}`,
      );
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

  const workers = Array.from({ length: Math.min(BLUR_CONCURRENCY, entries.length) }, () =>
    worker(),
  );
  await Promise.all(workers);

  return blurMap;
}

/**
 * Apply blur data URLs to a list of book items in place.
 * Uses batched blur generation for resilience and controlled concurrency.
 */
export async function applyBookCoverBlurs<TItem extends { id: string; coverBlurDataURL?: string }>(
  items: TItem[],
  buildCoverUrl: (id: string) => string,
): Promise<void> {
  if (items.length === 0) return;

  const coverUrls = new Map(items.map((item) => [item.id, buildCoverUrl(item.id)]));
  const blurMap = await generateBookCoverBlursInBatch(coverUrls);

  for (const item of items) {
    const blur = blurMap.get(item.id);
    if (blur) {
      item.coverBlurDataURL = blur;
    }
  }
}
