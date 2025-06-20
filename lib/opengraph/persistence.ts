/**
 * OpenGraph Persistence Module
 *
 * Handles background persistence of OpenGraph data to S3.
 *
 * @module opengraph/persistence
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { readFromS3, writeJsonS3, writeToS3 } from "@/lib/s3-utils";
import { OPENGRAPH_JINA_HTML_S3_DIR, OPENGRAPH_OVERRIDES_S3_DIR } from "./constants";
import { hashUrl } from "@/lib/utils/opengraph-utils";
import { persistImageToS3 } from "@/lib/image-handling/image-s3-utils";
import type { OgResult } from "@/types";
import { OgError, isOgResult } from "@/types/opengraph";

/**
 * Persists the raw HTML from Jina AI to S3 in the background.
 * This is a fire-and-forget operation.
 *
 * @param url - The original URL, used to create a consistent hash.
 * @param html - The HTML content to store.
 */
export function persistJinaHtmlInBackground(url: string, html: string): void {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(url)}.html`;

  void (async () => {
    try {
      await writeToS3(s3Key, html, "text/html; charset=utf-8");
      console.log(`[OpenGraph S3] 💾 Successfully persisted Jina HTML to S3: ${s3Key} (${html.length} bytes)`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error persisting Jina HTML to S3 for ${url}`, "s3-write-jina", {
        originalError: error,
      });
      console.error(`[OpenGraph S3] ❌ Failed to persist Jina HTML: ${ogError.message}`);
    }
  })();
}

/**
 * Retrieves cached Jina AI HTML from S3.
 *
 * @param url - The original URL to look up.
 * @returns The cached HTML content or null if not found.
 */
export async function getCachedJinaHtml(url: string): Promise<string | null> {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(url)}.html`;

  try {
    const result = await readFromS3(s3Key);
    if (result) {
      debug(`[DataAccess/OpenGraph] Found cached Jina HTML in S3: ${s3Key}`);
      return Buffer.isBuffer(result) ? result.toString("utf-8") : result;
    }
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "NoSuchKey") {
      debug(`[DataAccess/OpenGraph] No cached Jina HTML found in S3 for ${url}`);
    } else {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error reading Jina HTML from S3 for ${url}`, "s3-read-jina", {
        originalError: error,
      });
      debugWarn(`[DataAccess/OpenGraph] ${ogError.message}`, ogError.message);
    }
  }

  return null;
}

/**
 * Retrieves a hardcoded OpenGraph override from S3.
 *
 * @param url - The original URL to look up.
 * @returns The override data or null if not found.
 */
export async function getS3Override(url: string): Promise<OgResult | null> {
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(url)}.json`;

  try {
    const override = await readFromS3(s3Key);
    if (override) {
      debug(`[DataAccess/OpenGraph] Found S3 override for ${url}`);
      const overrideContent = Buffer.isBuffer(override) ? override.toString("utf-8") : override;
      const data: unknown = JSON.parse(overrideContent);
      if (isOgResult(data)) {
        return data;
      }
      debugWarn(`[DataAccess/OpenGraph] Malformed S3 override for ${url}`);
    }
  } catch (err) {
    if (!(err instanceof Error && "code" in err && (err as { code: string }).code === "NoSuchKey")) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error reading S3 override for ${url}`, "s3-read-override", {
        originalError: error,
      });
      debugWarn(`[DataAccess/OpenGraph] ${ogError.message}`, ogError.message);
    }
  }

  return null;
}

/**
 * Persists an OpenGraph override to S3.
 *
 * @param url - The original URL.
 * @param data - The OpenGraph data to store.
 */
export async function persistS3Override(url: string, data: OgResult): Promise<void> {
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(url)}.json`;

  try {
    await writeJsonS3(s3Key, data);
    debug(`[DataAccess/OpenGraph] Successfully persisted S3 override for ${url}`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const ogError = new OgError(`Error persisting S3 override for ${url}`, "s3-write-override", {
      originalError: error,
    });
    debugWarn(`[DataAccess/OpenGraph] ${ogError.message}`, ogError.message);
  }
}

/**
 * Schedules background image persistence to S3.
 * This is a fire-and-forget operation that includes automatic OpenGraph recrawl
 * when image URLs return 404 errors.
 *
 * @param imageUrl - URL of the image to persist
 * @param s3Directory - S3 directory to store the image
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to (for automatic recrawl)
 */
export function scheduleImagePersistence(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): void {
  void (async () => {
    try {
      const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
      if (s3Key) {
        console.log(`[OpenGraph S3] 🖼️ Successfully persisted image to S3: ${s3Key} from ${imageUrl}`);
      } else {
        console.warn(`[OpenGraph S3] ⚠️ Image persistence failed for: ${imageUrl}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error in scheduled image persistence for ${imageUrl}`, "s3-persist-image", {
        originalError: error,
      });
      console.error(`[OpenGraph S3] ❌ Image persistence error: ${ogError.message}`);
    }
  })();
}
