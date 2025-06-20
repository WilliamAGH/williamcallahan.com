/**
 * OpenGraph Data Access Module
 *
 * Orchestrates fetching, caching, and serving of OpenGraph metadata
 * Access pattern: In-memory Cache → S3 Storage → External APIs
 * Provides resilient OpenGraph data retrieval with comprehensive error handling
 *
 * @module data-access/opengraph
 */

import { readJsonS3, writeJsonS3 } from "@/lib/s3-utils";
import { ServerCacheInstance } from "@/lib/server-cache";
import { debug } from "@/lib/utils/debug";
import { findImageInS3, serveImageFromS3 } from "@/lib/image-handling/image-s3-utils";
import { getDomainType, hashUrl, isValidImageUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { hasDomainFailedTooManyTimes, markDomainAsFailed } from "@/lib/data-access/logos/session";
import {
  OPENGRAPH_S3_KEY_DIR,
  OPENGRAPH_METADATA_S3_DIR,
  OPENGRAPH_IMAGES_S3_DIR,
  OPENGRAPH_CACHE_DURATION,
} from "@/lib/opengraph/constants";
import { fetchExternalOpenGraphWithRetry } from "@/lib/opengraph/fetch";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { scheduleImagePersistence } from "@/lib/opengraph/persistence";
import type { OgResult } from "@/types";
import { isOgResult, OgError } from "@/types/opengraph";
import { karakeepImageFallbackSchema } from "@/types/seo/opengraph";

// Re-export constants for backwards compatibility
export { OPENGRAPH_S3_KEY_DIR, OPENGRAPH_METADATA_S3_DIR, OPENGRAPH_IMAGES_S3_DIR };

const inFlightOgPromises: Map<string, Promise<OgResult | null>> = new Map();

/**
 * Retrieves OpenGraph data using a multi-layered approach for optimal performance
 *
 * **Retrieval order:**
 * 1. **Memory cache** (fastest) - In-memory storage for immediate reuse
 * 2. **S3 persistent storage** (fast) - Durable storage surviving server restarts
 * 3. **External API** (slowest) - Fresh fetch from source URL
 *
 * **Persistence strategy:**
 * When fetching externally, data is stored in both memory cache and S3 persistent storage
 *
 * @param url - URL to get OpenGraph data for
 * @param skipExternalFetch - If true, only check in-memory cache and S3 persistent storage
 * @param idempotencyKey - A unique key to ensure idempotent image storage, such as a bookmark ID
 * @param fallbackImageData - Optional Karakeep image data to use as fallback when external fetch fails
 * @returns Promise resolving to OpenGraph data with images served from S3 when available
 */
export async function getOpenGraphData(
  url: string,
  skipExternalFetch = false,
  idempotencyKey?: string,
  fallbackImageData?: unknown,
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  const validatedFallback = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).data
    : undefined;

  debug(`[DataAccess/OpenGraph] 🔍 Getting OpenGraph data for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", validatedFallback);
  }

  // Check memory cache first
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  if (cached && Date.now() - (cached.timestamp ?? 0) < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000) {
    debug(`[DataAccess/OpenGraph] 📋 Returning from memory cache: ${normalizedUrl}`);

    const updatedResult: OgResult = { ...cached };

    const imageUrl = updatedResult.imageUrl;
    if (imageUrl && isValidImageUrl(imageUrl) && imageUrl.startsWith("http")) {
      const persistedImageKey = await findImageInS3(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        normalizedUrl,
      );

      if (persistedImageKey) {
        updatedResult.imageUrl = persistedImageKey;
        debug(`[DataAccess/OpenGraph] Upgraded image URL to S3: ${persistedImageKey}`);
      } else {
        debug(`[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${imageUrl}`);
        scheduleImagePersistence(imageUrl, OPENGRAPH_IMAGES_S3_DIR, "OpenGraph", idempotencyKey, normalizedUrl);
      }
    }

    const bannerImageUrl = updatedResult.bannerImageUrl;
    if (bannerImageUrl && isValidImageUrl(bannerImageUrl) && bannerImageUrl.startsWith("http")) {
      const persistedBannerKey = await findImageInS3(
        bannerImageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        normalizedUrl,
      );

      if (persistedBannerKey) {
        updatedResult.bannerImageUrl = persistedBannerKey;
        debug(`[DataAccess/OpenGraph] Upgraded banner URL to S3: ${persistedBannerKey}`);
      } else {
        debug(`[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${bannerImageUrl}`);
        scheduleImagePersistence(bannerImageUrl, OPENGRAPH_IMAGES_S3_DIR, "OpenGraph", idempotencyKey, normalizedUrl);
      }
    }

    if (updatedResult.imageUrl !== cached?.imageUrl || updatedResult.bannerImageUrl !== cached?.bannerImageUrl) {
      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedResult, false);
    }

    return updatedResult;
  }

  // Check circuit breaker using existing session management
  const domain = getDomainType(normalizedUrl);
  if (hasDomainFailedTooManyTimes(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} has failed too many times, using fallback`);
    return createFallbackResult(normalizedUrl, "Domain temporarily unavailable", validatedFallback);
  }

  // If we have stale in-memory cache and should refresh, start background refresh
  if (cached && !skipExternalFetch) {
    debug(`[DataAccess/OpenGraph] Using stale memory cache while refreshing in background: ${normalizedUrl}`);

    refreshOpenGraphData(normalizedUrl, idempotencyKey, validatedFallback).catch((error) => {
      const ogError = new OgError(`Background refresh failed for ${normalizedUrl}`, "refresh", {
        originalError: error,
      });
      console.error(`[DataAccess/OpenGraph] ${ogError.message}:`, ogError);
    });

    return {
      ...cached,
      source: "cache",
    };
  }

  // Try to read from S3 persistent storage if not in memory cache
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`);
    if (isOgResult(stored)) {
      debug(`[DataAccess/OpenGraph] 📁 Found in S3 storage: ${normalizedUrl}`);

      const updatedStoredResult: OgResult = { ...stored };

      const imageUrl = updatedStoredResult.imageUrl;
      if (imageUrl && isValidImageUrl(imageUrl) && imageUrl.startsWith("http")) {
        const persistedImageKey = await findImageInS3(
          imageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );

        if (persistedImageKey) {
          updatedStoredResult.imageUrl = persistedImageKey;
          debug(`[DataAccess/OpenGraph] Upgraded stored image URL to S3: ${persistedImageKey}`);
        } else {
          debug(`[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${imageUrl}`);
          scheduleImagePersistence(imageUrl, OPENGRAPH_IMAGES_S3_DIR, "OpenGraph", idempotencyKey, normalizedUrl);
        }
      }

      const bannerUrl = updatedStoredResult.bannerImageUrl;
      if (bannerUrl && isValidImageUrl(bannerUrl) && bannerUrl.startsWith("http")) {
        const persistedBannerKey = await findImageInS3(
          bannerUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );

        if (persistedBannerKey) {
          updatedStoredResult.bannerImageUrl = persistedBannerKey;
          debug(`[DataAccess/OpenGraph] Upgraded stored banner URL to S3: ${persistedBannerKey}`);
        } else {
          debug(`[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${bannerUrl}`);
          scheduleImagePersistence(bannerUrl, OPENGRAPH_IMAGES_S3_DIR, "OpenGraph", idempotencyKey, normalizedUrl);
        }
      }

      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedStoredResult, false);
      return updatedStoredResult;
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    if ("code" in error && error.code === "NoSuchKey") {
      debug(`[DataAccess/OpenGraph]  S3 cache miss for: ${normalizedUrl}`);
    } else {
      const ogError = new OgError(`Failed to read from S3 for ${normalizedUrl}`, "s3-read", {
        originalError: error,
      });
      console.warn(`[DataAccess/OpenGraph] ${ogError.message}`, ogError);
    }
  }

  // If skipping external fetch, return fallback now
  if (skipExternalFetch) {
    debug(`[DataAccess/OpenGraph] 🚫 Skipping external fetch, returning fallback: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, "Skipped external fetch", validatedFallback);
  }

  // Fetch from external source if not in cache or S3
  debug(`[DataAccess/OpenGraph] 🌐 Fetching from external source: ${normalizedUrl}`);
  const externalResult = await refreshOpenGraphData(normalizedUrl, idempotencyKey, validatedFallback);

  if (externalResult) {
    return externalResult;
  }

  // If all else fails, return a basic fallback
  debug("[DataAccess/OpenGraph] Using fallback due to fetch unavailability");
  return createFallbackResult(normalizedUrl, "External source unavailable", validatedFallback);
}

/**
 * Forces a refresh of OpenGraph data from the external URL, bypassing caches
 *
 * @param url - URL to refresh OpenGraph data for
 * @param idempotencyKey - A unique key to ensure idempotent image storage
 * @param fallbackImageData - Optional Karakeep image data for fallbacks
 * @returns Fresh OpenGraph data or null if refresh fails
 */
export async function refreshOpenGraphData(
  url: string,
  idempotencyKey?: string,
  fallbackImageData?: unknown,
): Promise<OgResult | null> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);
  let promise = inFlightOgPromises.get(urlHash);

  // Acknowledge unused parameters for now
  void idempotencyKey;

  if (promise) {
    debug(`[DataAccess/OpenGraph] Joining in-flight request for: ${normalizedUrl}`);
    return promise;
  }

  const validatedFallback = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).data
    : undefined;

  promise = (async () => {
    try {
      debug(`[DataAccess/OpenGraph] 🚀 Refreshing OpenGraph data for: ${normalizedUrl}`);
      const result = await fetchExternalOpenGraphWithRetry(normalizedUrl, validatedFallback);

      // Handle successful result
      if (result && typeof result === "object" && "url" in result) {
        debug(`[DataAccess/OpenGraph] ✅ Successfully refreshed: ${normalizedUrl}`);
        ServerCacheInstance.setOpenGraphData(normalizedUrl, result, false);
        await writeJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, result);
        return result;
      }

      // Handle network failure (expected scenario)
      if (result && typeof result === "object" && "networkFailure" in result) {
        debug(`[DataAccess/OpenGraph] Network unavailable for: ${normalizedUrl}, using fallback`);
        const fallback = createFallbackResult(normalizedUrl, "Network connectivity issue", validatedFallback);
        // Cache the fallback for a shorter duration to retry sooner
        ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
        return fallback;
      }

      // Handle null result (permanent failure or blocked)
      debug(`[DataAccess/OpenGraph] External source unavailable for: ${normalizedUrl}`);
      const fallback = createFallbackResult(normalizedUrl, "External source unavailable", validatedFallback);
      ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
      return fallback;
    } catch (error) {
      // This catch block now only handles unexpected errors (parsing, S3 writes, etc.)
      const ogError =
        error instanceof OgError
          ? error
          : new OgError(`Unexpected error during refresh for ${normalizedUrl}`, "refresh", { originalError: error });

      console.error(`[DataAccess/OpenGraph] Unexpected error: ${ogError.message}`, ogError);
      markDomainAsFailed(getDomainType(normalizedUrl));

      // Create fallback result for unexpected errors
      const fallback = createFallbackResult(normalizedUrl, "Processing error occurred", validatedFallback);
      fallback.errorDetails = ogError;
      ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
      return fallback;
    } finally {
      inFlightOgPromises.delete(urlHash);
    }
  })();

  inFlightOgPromises.set(urlHash, promise);
  return promise;
}

/**
 * Serves an OpenGraph image from S3.
 *
 * @param s3Key - The S3 key of the image to serve.
 * @returns An object containing the image buffer and content type, or null if not found.
 */
export async function serveOpenGraphImage(s3Key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  try {
    return await serveImageFromS3(s3Key);
  } catch (error) {
    const ogError = new OgError(`Failed to serve image from S3: ${s3Key}`, "s3-serve-image", {
      originalError: error,
    });
    console.error(`[DataAccess/OpenGraph] ${ogError.message}`, ogError);
    return null;
  }
}
