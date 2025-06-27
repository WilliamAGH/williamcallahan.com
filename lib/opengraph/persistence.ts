/**
 * OpenGraph Persistence Module
 *
 * Handles background persistence of OpenGraph data to S3.
 *
 * @module opengraph/persistence
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { readFromS3, writeJsonS3, writeToS3 } from "@/lib/s3-utils";
import { OPENGRAPH_JINA_HTML_S3_DIR, OPENGRAPH_OVERRIDES_S3_DIR } from "@/lib/constants";
import { hashUrl, normalizeUrl } from "@/lib/utils/opengraph-utils";
import { persistImageToS3 } from "@/lib/image-handling/image-s3-utils";
import type { OgResult, PersistImageResult } from "@/types";
import { OgError, isOgResult } from "@/types/opengraph";

/**
 * Persists the raw HTML from Jina AI to S3 in the background.
 * This is a fire-and-forget operation.
 *
 * @param url - The original URL, used to create a consistent hash.
 * @param html - The HTML content to store.
 */
export function persistJinaHtmlInBackground(url: string, html: string): void {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;

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
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;

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
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(normalizeUrl(url))}.json`;

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
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(normalizeUrl(url))}.json`;

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
  // Log immediately when scheduling
  // Truncate base64 data for logging
  const displayUrl = imageUrl.startsWith("data:") ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` : imageUrl;
  console.log(`[OpenGraph S3] 📋 Scheduling image persistence for: ${displayUrl}`);
  console.log(
    `[OpenGraph S3] 📋 Context: ${logContext}, Page: ${pageUrl || "N/A"}, IdempotencyKey: ${idempotencyKey || "N/A"}`,
  );

  void (async () => {
    try {
      const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
      if (s3Key) {
        console.log(`[OpenGraph S3] ✅ Successfully persisted image to S3: ${s3Key} from ${displayUrl}`);
      } else {
        console.error(`[OpenGraph S3] ❌ FAILED to persist image: ${displayUrl}`);
        console.error(`[OpenGraph S3] ❌ Reason: persistImageToS3 returned null`);
        console.error(`[OpenGraph S3] ❌ Context: ${logContext}, Page: ${pageUrl || "N/A"}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error in scheduled image persistence for ${displayUrl}`, "s3-persist-image", {
        originalError: error,
      });
      console.error(`[OpenGraph S3] ❌ CRITICAL: Image persistence error for ${displayUrl}`);
      console.error(`[OpenGraph S3] ❌ Error details: ${ogError.message}`);
      console.error(`[OpenGraph S3] ❌ Stack trace:`, error.stack || "No stack trace available");
      console.error(`[OpenGraph S3] ❌ Context: ${logContext}, Page: ${pageUrl || "N/A"}`);
    }
  })();
}

/**
 * Persists an OpenGraph image to S3 synchronously and returns the S3 URL.
 * Used during batch processing when we need the S3 URL immediately.
 *
 * @param imageUrl - URL of the image to persist
 * @param s3Directory - S3 directory to store the image
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 * @returns S3 URL if successful, null otherwise
 */
export async function persistImageAndGetS3Url(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): Promise<string | null> {
  // Truncate base64 data for logging
  const displayUrl = imageUrl.startsWith("data:") ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` : imageUrl;
  console.log(`[OpenGraph S3] 🔄 Persisting image synchronously: ${displayUrl}`);

  try {
    const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    if (s3Key) {
      // Construct the full S3 URL
      const s3Url = `${process.env.NEXT_PUBLIC_S3_CDN_URL}/${s3Key}`;
      console.log(`[OpenGraph S3] ✅ Image persisted, S3 URL: ${s3Url}`);
      return s3Url;
    } else {
      console.error(`[OpenGraph S3] ❌ Failed to persist image: ${displayUrl}`);
      return null;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[OpenGraph S3] ❌ Error persisting image ${displayUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Persists an OpenGraph image to S3 synchronously and returns detailed result.
 * Used during batch processing when we need to track whether image was newly uploaded.
 *
 * @param imageUrl - URL of the image to persist
 * @param s3Directory - S3 directory to store the image
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 * @returns PersistImageResult with S3 URL and whether it was newly persisted
 */
export async function persistImageAndGetS3UrlWithStatus(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): Promise<PersistImageResult> {
  // Truncate base64 data for logging
  const displayUrl = imageUrl.startsWith("data:") ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` : imageUrl;
  console.log(`[OpenGraph S3] 🔄 Checking and persisting image: ${displayUrl}`);

  try {
    // First check if image already exists
    const { findImageInS3 } = await import("@/lib/image-handling/image-s3-utils");
    const existingKey = await findImageInS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);

    if (existingKey) {
      const s3Url = `${process.env.NEXT_PUBLIC_S3_CDN_URL}/${existingKey}`;
      console.log(`[OpenGraph S3] ✅ Image already exists in S3: ${s3Url}`);
      return { s3Url, wasNewlyPersisted: false };
    }

    // Image doesn't exist, persist it
    const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    if (s3Key) {
      const s3Url = `${process.env.NEXT_PUBLIC_S3_CDN_URL}/${s3Key}`;
      console.log(`[OpenGraph S3] ✅ Image newly persisted, S3 URL: ${s3Url}`);
      return { s3Url, wasNewlyPersisted: true };
    } else {
      console.error(`[OpenGraph S3] ❌ Failed to persist image: ${displayUrl}`);
      return { s3Url: null, wasNewlyPersisted: false };
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[OpenGraph S3] ❌ Error persisting image ${displayUrl}: ${error.message}`);
    return { s3Url: null, wasNewlyPersisted: false };
  }
}
