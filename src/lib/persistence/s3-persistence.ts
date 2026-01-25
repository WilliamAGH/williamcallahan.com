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
import { OPENGRAPH_JINA_HTML_S3_DIR, OPENGRAPH_OVERRIDES_S3_DIR, OPENGRAPH_JSON_S3_PATHS } from "@/lib/constants";
import type { OgResult, PersistImageResult } from "@/types";
import { OgError, isOgResult } from "@/types/opengraph";
import { ContentCategory } from "@/types/s3-cdn";
import { isS3ReadOnly } from "@/lib/utils/s3-read-only";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";

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
  forcePrivate = false,
): Promise<void> {
  const category = getContentCategory(contentType, s3Key);

  // Determine ACL based on content category and force flag
  let acl: "private" | "public-read" = "public-read"; // Default to public

  if (forcePrivate || category === ContentCategory.PrivateData) {
    acl = "private";
  }

  if (isDebug) {
    debug(`[S3 Persistence] Writing to ${s3Key} with ACL: ${acl}, ContentType: ${contentType || "auto"}`);
  } else {
    console.log(`[S3 Persistence] Writing to ${s3Key} with ACL: ${acl}`);
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
export async function persistBinaryToS3(s3Key: string, data: Buffer | Readable, contentType: string): Promise<void> {
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
 * Persist Jina AI markdown content to S3 in the background
 *
 * @param url - URL of the page that was fetched
 * @param markdown - Markdown content to persist
 */
export function persistJinaMarkdownInBackground(url: string, markdown: string): void {
  const s3Key = `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-markdown/${hashUrl(normalizeUrl(url))}.md`;

  void (async () => {
    try {
      // Use centralized persistence with public-read ACL
      await persistToS3(s3Key, markdown, "text/markdown; charset=utf-8");
      console.log(`[OpenGraph S3] 📝 Successfully persisted Jina markdown to S3: ${s3Key} (${markdown.length} bytes)`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error persisting Jina markdown to S3 for ${url}`, "s3-write-jina-markdown", {
        originalError: error,
      });
      console.error(`[OpenGraph S3] ❌ Failed to persist Jina markdown: ${ogError.message}`);
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
 * Get cached Jina AI markdown from S3
 *
 * @param url - URL of the page to look up
 * @returns Markdown content if found, null otherwise
 */
export async function getCachedJinaMarkdown(url: string): Promise<string | null> {
  const s3Key = `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-markdown/${hashUrl(normalizeUrl(url))}.md`;

  try {
    const result = await readFromS3(s3Key);
    if (result) {
      debug(`[DataAccess/OpenGraph] Found cached Jina markdown in S3: ${s3Key}`);
      return Buffer.isBuffer(result) ? result.toString("utf-8") : result;
    }
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "NoSuchKey") {
      debug(`[DataAccess/OpenGraph] No cached Jina markdown found in S3 for ${url}`);
    } else {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Error reading Jina markdown from S3 for ${url}`, "s3-read-jina-markdown", {
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
  // Check if we're in read-only mode (build phase, tests, etc.)
  if (isS3ReadOnly()) {
    console.log(`[OpenGraph S3] Read-only mode - skipping image persistence`);
    return null;
  }

  const displayUrl = imageUrl.startsWith("data:") ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` : imageUrl;

  console.log(`[OpenGraph S3] 🔄 Persisting image synchronously: ${displayUrl}`);

  try {
    const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    if (s3Key) {
      const cdnUrl = getS3CdnUrl();
      if (!cdnUrl) {
        console.error("[OpenGraph S3] ❌ S3_CDN_URL not configured");
        return null;
      }
      const s3Url = `${cdnUrl}/${s3Key}`;
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
  // Check if we're in read-only mode (build phase, tests, etc.)
  if (isS3ReadOnly()) {
    // Skip validation for internal /api/assets/ URLs - these are our own proxy endpoints
    // and should always be valid. Also skip data URLs.
    const isInternalAsset = imageUrl.startsWith("/api/assets/");
    const isDataUrl = imageUrl.startsWith("data:");

    if (!isInternalAsset && !isDataUrl) {
      try {
        // Try HEAD first, then gracefully fall back to a 1-byte GET if HEAD is blocked.
        const headResult = await fetch(imageUrl, { method: "HEAD", signal: AbortSignal.timeout(5000) }).catch(
          () => null,
        );
        let headOk = !!(headResult?.ok && headResult.headers.get("content-type")?.startsWith("image/"));

        if (!headOk && headResult && [405, 501].includes(headResult.status)) {
          // Some CDNs block HEAD requests, try a minimal GET instead
          const getResult = await fetch(imageUrl, {
            method: "GET",
            headers: { Range: "bytes=0-0" },
            signal: AbortSignal.timeout(5000),
          }).catch(() => null);
          headOk = !!(getResult?.ok && getResult.headers.get("content-type")?.startsWith("image/"));
        }

        if (!headOk) {
          console.warn(`[OpenGraph S3] HEAD validation failed for ${imageUrl} – skipping immediate use`);
          return { s3Url: null, wasNewlyPersisted: false };
        }
      } catch {
        // network error – treat as invalid
        return { s3Url: null, wasNewlyPersisted: false };
      }
    } else if (isInternalAsset || isDataUrl) {
      console.log(
        `[OpenGraph S3] Skipping validation for ${isDataUrl ? "data URL" : "internal asset URL"}: ${isDataUrl ? "data:..." : imageUrl}`,
      );
    }

    // For internal assets or data URLs, don't schedule persistence since they're already hosted inline or by us
    // Just return the URL which will work from any host
    if (isInternalAsset || isDataUrl) {
      console.log(
        `[OpenGraph S3] Using ${isDataUrl ? "data" : "relative"} URL for ${isDataUrl ? "inline" : "internal Karakeep"} asset`,
      );
      return { s3Url: imageUrl, wasNewlyPersisted: false };
    }

    // Schedule background persistence for external URLs after basic validation
    scheduleImagePersistence(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    return { s3Url: imageUrl, wasNewlyPersisted: false };
  }

  const displayUrl = imageUrl.startsWith("data:") ? `${imageUrl.substring(0, 50)}...[base64 data truncated]` : imageUrl;

  console.log(`[OpenGraph S3] 🔄 Checking and persisting image: ${displayUrl}`);

  try {
    // First check if image already exists
    const existingKey = await findImageInS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);

    if (existingKey) {
      const cdnUrl = getS3CdnUrl();
      if (!cdnUrl) {
        console.error("[OpenGraph S3] ❌ S3_CDN_URL not configured");
        return { s3Url: null, wasNewlyPersisted: false };
      }
      const s3Url = `${cdnUrl}/${existingKey}`;
      console.log(`[OpenGraph S3] ✅ Image already exists in S3: ${s3Url}`);
      return { s3Url, wasNewlyPersisted: false };
    }

    // Image doesn't exist, persist it
    const s3Key = await persistImageToS3(imageUrl, s3Directory, logContext, idempotencyKey, pageUrl);
    if (s3Key) {
      const cdnUrl = getS3CdnUrl();
      if (!cdnUrl) {
        console.error("[OpenGraph S3] ❌ S3_CDN_URL not configured");
        return { s3Url: null, wasNewlyPersisted: false };
      }
      const s3Url = `${cdnUrl}/${s3Key}`;
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

/**
 * Persist an image buffer directly to S3 (for Karakeep assets)
 *
 * @param imageBuffer - Buffer containing the image data
 * @param s3Directory - S3 directory to store the image
 * @param assetId - Karakeep asset ID
 * @param logContext - Context for logging
 * @param idempotencyKey - Unique key for idempotent storage
 * @param pageUrl - URL of the page the image belongs to
 * @returns S3 URL if successful, null otherwise
 */
export async function persistImageBufferToS3(
  imageBuffer: Buffer,
  s3Directory: string,
  assetId: string,
  logContext: string,
  idempotencyKey?: string,
  pageUrl?: string,
): Promise<string | null> {
  // Check if we're in read-only mode (build phase, tests, etc.)
  if (isS3ReadOnly()) {
    console.log(`[OpenGraph S3] Read-only mode - skipping Karakeep asset persistence for ${assetId}`);
    return null;
  }

  try {
    console.log(`[OpenGraph S3] 🔄 Processing Karakeep asset buffer: ${assetId} (${imageBuffer.length} bytes)`);

    // Process the image buffer to detect format and optimize
    const { processImageBufferSimple } = await import("@/lib/image-handling/shared-image-processing");
    const { processedBuffer, contentType } = await processImageBufferSimple(imageBuffer, logContext);

    // Generate S3 key for the asset
    const { getOgImageS3Key, hashImageContent } = await import("@/lib/utils/opengraph-utils");
    const s3Key = getOgImageS3Key(
      `karakeep-asset-${assetId}`,
      s3Directory,
      pageUrl,
      idempotencyKey || assetId,
      hashImageContent(processedBuffer),
    );

    // Upload to S3
    console.log(`[OpenGraph S3] 📤 Uploading Karakeep asset to S3: ${s3Key} (${processedBuffer.length} bytes)`);
    await writeBinaryS3(s3Key, processedBuffer, contentType);

    // Return the S3 CDN URL
    const cdnUrl = getS3CdnUrl();
    if (!cdnUrl) {
      console.error("[OpenGraph S3] ❌ S3_CDN_URL not configured");
      return null;
    }

    const s3Url = `${cdnUrl}/${s3Key}`;
    console.log(`[OpenGraph S3] ✅ Successfully persisted Karakeep asset to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenGraph S3] ❌ Failed to persist Karakeep asset ${assetId}: ${errorMessage}`);
    return null;
  }
}

// Re-export commonly used functions for backward compatibility
export { persistImageToS3, findImageInS3 } from "@/lib/image-handling/image-s3-utils";
export { checkIfS3ObjectExists } from "@/lib/s3-utils";

/**
 * Cleanup and normalize logo filenames in S3
 * This function can be run periodically to ensure all logos follow the standard naming convention
 */
export async function normalizeLogoFilenames(): Promise<void> {
  if (isS3ReadOnly()) {
    console.log("[S3 Persistence] Read-only mode, skipping logo normalization");
    return;
  }

  try {
    const { ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const { IMAGE_S3_PATHS } = await import("@/lib/constants");
    const { parseS3Key, generateS3Key } = await import("@/lib/utils/hash-utils");
    const { s3Client } = await import("@/lib/s3-utils");

    if (!s3Client || !process.env.S3_BUCKET) {
      console.error("[S3 Persistence] S3 not configured for logo normalization");
      return;
    }

    const bucket = process.env.S3_BUCKET;
    const prefix = IMAGE_S3_PATHS.LOGOS_DIR + "/";

    // List all logos with pagination
    const objects: Array<{ Key?: string }> = [];
    let continuationToken: string | undefined;

    do {
      const response = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: 1000,
          ContinuationToken: continuationToken,
        }),
      );
      if (response.Contents && response.Contents.length > 0) {
        objects.push(...response.Contents);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    console.log(`[S3 Persistence] Found ${objects.length} logos to check`);

    for (const obj of objects) {
      if (!obj.Key) continue;

      const parsed = parseS3Key(obj.Key);

      // Check if it needs normalization
      if (parsed.type === "logo" && parsed.domain && !parsed.hash) {
        console.log(`[S3 Persistence] Found logo without hash: ${obj.Key}`);

        // Generate the proper filename with hash
        const newKey = generateS3Key({
          type: "logo",
          domain: parsed.domain,
          source: parsed.source as import("@/types/logo").LogoSource,
          extension: parsed.extension || "png",
          inverted: parsed.inverted,
        });

        console.log(`[S3 Persistence] Renaming to: ${newKey}`);

        // Copy to new location
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${obj.Key}`,
            Key: newKey,
            ACL: "public-read",
          }),
        );

        // Delete old file
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: obj.Key,
          }),
        );

        console.log(`[S3 Persistence] Successfully normalized: ${obj.Key} -> ${newKey}`);
      }
    }

    console.log("[S3 Persistence] Logo normalization complete");
  } catch (error) {
    console.error("[S3 Persistence] Error normalizing logo filenames:", error);
  }
}
