/**
 * Image Persistence Module
 *
 * Handles image upload and storage to S3 with idempotent operations.
 * Extracted from s3-persistence.ts for SRP compliance.
 *
 * @module persistence/image-persistence
 */

import { writeBinaryS3 } from "@/lib/s3/binary";
import { persistImageToS3, findImageInS3 } from "@/lib/image-handling/image-s3-utils";
import { isS3ReadOnly } from "@/lib/utils/s3-read-only";
import { getS3CdnUrl } from "@/lib/utils/cdn-utils";
import type { PersistImageResult } from "@/types";
import { OgError } from "@/types/opengraph";

// ============================================================================
// DRY Helpers
// ============================================================================

/**
 * Format image URL for display in logs (truncates base64 data URLs)
 */
function getDisplayUrl(imageUrl: string): string {
  return imageUrl.startsWith("data:")
    ? `${imageUrl.substring(0, 50)}...[base64 data truncated]`
    : imageUrl;
}

/**
 * Build full S3 CDN URL from an S3 key
 * @throws OgError if CDN URL is not configured
 */
function buildS3CdnUrl(s3Key: string): string {
  const cdnUrl = getS3CdnUrl();
  if (!cdnUrl) {
    throw new OgError(
      "NEXT_PUBLIC_S3_CDN_URL not configured - cannot construct S3 URL",
      "s3-config-missing",
    );
  }
  return `${cdnUrl}/${s3Key}`;
}

/**
 * Build S3 CDN URL, returning null on configuration error (for non-throwing contexts)
 */
function buildS3CdnUrlOrNull(s3Key: string, logContext: string): string | null {
  const cdnUrl = getS3CdnUrl();
  if (!cdnUrl) {
    console.error(`[OpenGraph S3] ${logContext} NEXT_PUBLIC_S3_CDN_URL not configured`);
    return null;
  }
  return `${cdnUrl}/${s3Key}`;
}

// ============================================================================
// Image Persistence Functions
// ============================================================================

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
  const displayUrl = getDisplayUrl(imageUrl);

  console.log(`[OpenGraph S3] 📋 Scheduling image persistence for: ${displayUrl}`);
  console.log(
    `[OpenGraph S3] 📋 Context: ${logContext}, Page: ${pageUrl || "N/A"}, IdempotencyKey: ${idempotencyKey || "N/A"}`,
  );

  void (async () => {
    try {
      const s3Key = await persistImageToS3(
        imageUrl,
        s3Directory,
        logContext,
        idempotencyKey,
        pageUrl,
      );
      if (s3Key) {
        console.log(
          `[OpenGraph S3] ✅ Successfully persisted image to S3: ${s3Key} from ${displayUrl}`,
        );
      } else {
        console.error(`[OpenGraph S3] ❌ FAILED to persist image: ${displayUrl}`);
        console.error(`[OpenGraph S3] ❌ Reason: persistImageToS3 returned null`);
        console.error(`[OpenGraph S3] ❌ Context: ${logContext}, Page: ${pageUrl || "N/A"}`);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(
        `Error in scheduled image persistence for ${displayUrl}`,
        "s3-persist-image",
        { originalError: error },
      );
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
 * @returns S3 URL if successful
 * @throws OgError on failure (including read-only mode returning null is NOT an error)
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

  const displayUrl = getDisplayUrl(imageUrl);

  console.log(`[OpenGraph S3] 🔄 Persisting image synchronously: ${displayUrl}`);

  try {
    const s3Key = await persistImageToS3(
      imageUrl,
      s3Directory,
      logContext,
      idempotencyKey,
      pageUrl,
    );
    if (s3Key) {
      const s3Url = buildS3CdnUrl(s3Key);
      console.log(`[OpenGraph S3] ✅ Image persisted, S3 URL: ${s3Url}`);
      return s3Url;
    } else {
      // persistImageToS3 returned null - internal failure, throw to surface it
      throw new OgError(`persistImageToS3 returned null for ${displayUrl}`, "s3-persist-failed");
    }
  } catch (err) {
    // Re-throw OgError as-is, wrap other errors
    if (err instanceof OgError) {
      throw err;
    }
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[OpenGraph S3] ❌ Error persisting image ${displayUrl}: ${error.message}`);
    throw new OgError(`Error persisting image to S3: ${displayUrl}`, "s3-persist-image", {
      originalError: error,
    });
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
        const headResult = await fetch(imageUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        let headOk = !!(
          headResult?.ok && headResult.headers.get("content-type")?.startsWith("image/")
        );

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
          console.warn(
            `[OpenGraph S3] HEAD validation failed for ${imageUrl} – skipping immediate use`,
          );
          return { s3Url: null, wasNewlyPersisted: false };
        }
      } catch (err) {
        // Network error during HEAD validation – log and return null per [RC1a]
        console.warn(
          `[OpenGraph S3] HEAD validation network error for ${imageUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
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

  const displayUrl = getDisplayUrl(imageUrl);

  console.log(`[OpenGraph S3] 🔄 Checking and persisting image: ${displayUrl}`);

  try {
    // First check if image already exists
    const existingKey = await findImageInS3(
      imageUrl,
      s3Directory,
      logContext,
      idempotencyKey,
      pageUrl,
    );

    if (existingKey) {
      const s3Url = buildS3CdnUrlOrNull(existingKey, "❌");
      if (!s3Url) {
        return { s3Url: null, wasNewlyPersisted: false };
      }
      console.log(`[OpenGraph S3] ✅ Image already exists in S3: ${s3Url}`);
      return { s3Url, wasNewlyPersisted: false };
    }

    // Image doesn't exist, persist it
    const s3Key = await persistImageToS3(
      imageUrl,
      s3Directory,
      logContext,
      idempotencyKey,
      pageUrl,
    );
    if (s3Key) {
      const s3Url = buildS3CdnUrlOrNull(s3Key, "❌");
      if (!s3Url) {
        return { s3Url: null, wasNewlyPersisted: false };
      }
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
    console.log(
      `[OpenGraph S3] Read-only mode - skipping Karakeep asset persistence for ${assetId}`,
    );
    return null;
  }

  try {
    console.log(
      `[OpenGraph S3] 🔄 Processing Karakeep asset buffer: ${assetId} (${imageBuffer.length} bytes)`,
    );

    // Process the image buffer to detect format and optimize
    const { processImageBufferSimple } =
      await import("@/lib/image-handling/shared-image-processing");
    const { processedBuffer, contentType } = await processImageBufferSimple(
      imageBuffer,
      logContext,
    );

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
    console.log(
      `[OpenGraph S3] 📤 Uploading Karakeep asset to S3: ${s3Key} (${processedBuffer.length} bytes)`,
    );
    await writeBinaryS3(s3Key, processedBuffer, contentType);

    // Return the S3 CDN URL
    const s3Url = buildS3CdnUrlOrNull(s3Key, "❌");
    if (!s3Url) {
      return null;
    }

    console.log(`[OpenGraph S3] ✅ Successfully persisted Karakeep asset to S3: ${s3Url}`);
    return s3Url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[OpenGraph S3] ❌ Failed to persist Karakeep asset ${assetId}: ${errorMessage}`);
    return null;
  }
}
