/**
 * Centralized S3 Persistence Module
 * 
 * Provides a unified interface for all S3 write operations with guaranteed
 * public-read ACL settings for DigitalOcean Spaces compatibility.
 * 
 * @module persistence/s3-persistence
 */

import { Readable } from "node:stream";
import { writeToS3, writeJsonS3, writeBinaryS3, readFromS3 } from "@/lib/s3-utils";
import { persistImageToS3, findImageInS3 } from "@/lib/image-handling/image-s3-utils";
import { debug, isDebug } from "@/lib/utils/debug";
import { hashUrl, normalizeUrl } from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_JINA_HTML_S3_DIR, OPENGRAPH_OVERRIDES_S3_DIR } from "@/lib/constants";
import type { OgResult, PersistImageResult } from "@/types";
import { OgError, isOgResult } from "@/types/opengraph";
import { ContentCategory } from "@/types/s3-cdn";

/**
 * Determine content category based on content type and path
 */
function getContentCategory(contentType: string | undefined, s3Key: string): ContentCategory {
  // Images are always public assets
  if (contentType?.startsWith("image/")) return ContentCategory.PublicAsset;
  
  // JSON data is typically public for this application
  if (contentType === "application/json" || s3Key.endsWith(".json")) {
    return ContentCategory.PublicData;
  }
  
  // HTML content (like Jina AI caches)
  if (contentType?.includes("text/html") || s3Key.endsWith(".html")) {
    return ContentCategory.Html;
  }
  
  // CSS/JS are public assets
  if (contentType?.includes("text/css") || contentType?.includes("javascript")) {
    return ContentCategory.PublicAsset;
  }
  
  // Default to public data for safety (aligns with bucket policy)
  return ContentCategory.PublicData;
}

/**
 * Persist any content to S3 with appropriate ACL settings
 * 
 * @param s3Key - The S3 object key
 * @param data - The data to write (string, Buffer, or Readable stream)
 * @param contentType - The MIME type of the content
 * @param forcePrivate - Force private ACL regardless of content type
 */
export async function persistToS3(
  s3Key: string,
  data: Buffer | string | Readable,
  contentType?: string,
  forcePrivate = false
): Promise<void> {
  const category = getContentCategory(contentType, s3Key);
  
  // Determine ACL based on content category and force flag
  let acl: "private" | "public-read" = "public-read"; // Default to public
  
  if (forcePrivate || category === ContentCategory.PrivateData) {
    acl = "private";
  }
  
  if (isDebug) {
    debug(`[S3 Persistence] Writing to ${s3Key} with ACL: ${acl}, ContentType: ${contentType || "auto"}`);
  }
  
  await writeToS3(s3Key, data, contentType, acl);
}

/**
 * Persist JSON data to S3 (always public-read for this application)
 * 
 * @param s3Key - The S3 object key
 * @param data - The JSON data to persist
 */
export async function persistJsonToS3<T>(s3Key: string, data: T): Promise<void> {
  if (isDebug) {
    debug(`[S3 Persistence] Writing JSON to ${s3Key} with public-read ACL`);
  }
  
  // writeJsonS3 already sets public-read ACL
  await writeJsonS3(s3Key, data);
}

/**
 * Persist binary data to S3 (always public-read for images)
 * 
 * @param s3Key - The S3 object key
 * @param data - The binary data (Buffer or Readable stream)
 * @param contentType - The MIME type of the content
 */
export async function persistBinaryToS3(
  s3Key: string,
  data: Buffer | Readable,
  contentType: string
): Promise<void> {
  if (isDebug) {
    debug(`[S3 Persistence] Writing binary to ${s3Key} with public-read ACL, ContentType: ${contentType}`);
  }
  
  // writeBinaryS3 already sets public-read ACL
  await writeBinaryS3(s3Key, data, contentType);
}

/**
 * Persist HTML content from Jina AI to S3
 * 
 * @param url - The original URL, used to create a consistent hash
 * @param html - The HTML content to store
 */
export function persistJinaHtmlInBackground(url: string, html: string): void {
  const s3Key = `${OPENGRAPH_JINA_HTML_S3_DIR}/${hashUrl(normalizeUrl(url))}.html`;

  void (async () => {
    try {
      // Use centralized persistence with public-read ACL
      await persistToS3(s3Key, html, "text/html; charset=utf-8");
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
 * Retrieve cached Jina AI HTML from S3
 * 
 * @param url - The original URL to look up
 * @returns The cached HTML content or null if not found
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
      debug(`[DataAccess/OpenGraph] ${ogError.message}`);
    }
  }

  return null;
}

/**
 * Retrieve a hardcoded OpenGraph override from S3
 * 
 * @param url - The original URL to look up
 * @returns The override data or null if not found
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
      debug(`[DataAccess/OpenGraph] Malformed S3 override for ${url}`);
    }
  } catch (err) {
    if (!(err instanceof Error && "code" in err && (err as { code: string }).code === "NoSuchKey")) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error reading S3 override for ${url}`, "s3-read-override", {
        originalError: error,
      });
      debug(`[DataAccess/OpenGraph] ${ogError.message}`);
    }
  }

  return null;
}

/**
 * Persist an OpenGraph override to S3
 * 
 * @param url - The original URL
 * @param data - The OpenGraph data to store
 */
export async function persistS3Override(url: string, data: OgResult): Promise<void> {
  const s3Key = `${OPENGRAPH_OVERRIDES_S3_DIR}/${hashUrl(normalizeUrl(url))}.json`;

  try {
    await persistJsonToS3(s3Key, data);
    debug(`[DataAccess/OpenGraph] Successfully persisted S3 override for ${url}`);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const ogError = new OgError(`Error persisting S3 override for ${url}`, "s3-write-override", {
      originalError: error,
    });
    debug(`[DataAccess/OpenGraph] ${ogError.message}`);
  }
}

/**
 * Schedule background image persistence to S3
 * 
 * @param imageUrl - URL of the image to persist
 * @param s3Directory - S3 directory to store the image
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 */
export function scheduleImagePersistence(
  imageUrl: string,
  s3Directory: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): void {
  const displayUrl = imageUrl.startsWith("data:") 
    ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` 
    : imageUrl;
  
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
 * Persist an OpenGraph image to S3 synchronously and return the S3 URL
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
  const displayUrl = imageUrl.startsWith("data:") 
    ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` 
    : imageUrl;
  
  console.log(`[OpenGraph S3] 🔄 Persisting image synchronously: ${displayUrl}`);

  try {
    const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    if (s3Key) {
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
 * Persist an OpenGraph image to S3 synchronously and return detailed result
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
  // When running in the web runtime, schedule background persistence
  if (process.env.IS_DATA_UPDATER !== "true") {
    scheduleImagePersistence(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    return { s3Url: imageUrl, wasNewlyPersisted: false };
  }
  
  const displayUrl = imageUrl.startsWith("data:") 
    ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` 
    : imageUrl;
  
  console.log(`[OpenGraph S3] 🔄 Checking and persisting image: ${displayUrl}`);

  try {
    // First check if image already exists
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

// Re-export commonly used functions for backward compatibility
export { persistImageToS3, findImageInS3 } from "@/lib/image-handling/image-s3-utils";
export { checkIfS3ObjectExists } from "@/lib/s3-utils";