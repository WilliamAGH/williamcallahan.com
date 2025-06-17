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
import { findImageInS3, persistImageToS3, serveImageFromS3 } from "@/lib/utils/image-s3-utils";
import {
  getDomainType,
  hashUrl,
  isValidImageUrl,
  normalizeUrl,
  validateOgUrl,
} from "@/lib/utils/opengraph-utils";
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
import type { KarakeepImageFallback, OgResult } from "@/types";

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
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  debug(`[DataAccess/OpenGraph] 🔍 Getting OpenGraph data for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", fallbackImageData);
  }

  // Check memory cache first
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  if (cached && Date.now() - cached.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000) {
    debug(`[DataAccess/OpenGraph] 📋 Returning from memory cache: ${normalizedUrl}`);

    // Update memory cache result with S3 URLs if available
    const updatedResult = { ...cached };

    // Check if we can upgrade external URLs to S3 persisted URLs (non-blocking)
    if (cached.imageUrl?.startsWith("http") && isValidImageUrl(cached.imageUrl)) {
      const persistedImageKey = await findImageInS3(
        cached.imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        normalizedUrl,
      );

      if (persistedImageKey) {
        updatedResult.imageUrl = persistedImageKey;
        debug(`[DataAccess/OpenGraph] Upgraded image URL to S3: ${persistedImageKey}`);
      } else {
        // Don't block response - schedule background persistence
        debug(
          `[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${cached.imageUrl}`,
        );
        scheduleImagePersistence(
          cached.imageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );
      }
    }

    if (cached.bannerImageUrl?.startsWith("http") && isValidImageUrl(cached.bannerImageUrl)) {
      const persistedBannerKey = await findImageInS3(
        cached.bannerImageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        normalizedUrl,
      );

      if (persistedBannerKey) {
        updatedResult.bannerImageUrl = persistedBannerKey;
        debug(`[DataAccess/OpenGraph] Upgraded banner URL to S3: ${persistedBannerKey}`);
      } else {
        // Don't block response - schedule background persistence
        debug(
          `[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${cached.bannerImageUrl}`,
        );
        scheduleImagePersistence(
          cached.bannerImageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );
      }
    }

    // Update memory cache if we made any upgrades
    if (
      updatedResult.imageUrl !== cached.imageUrl ||
      updatedResult.bannerImageUrl !== cached.bannerImageUrl
    ) {
      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedResult, false);
    }

    return updatedResult;
  }

  // Check circuit breaker using existing session management
  const domain = getDomainType(normalizedUrl);
  if (hasDomainFailedTooManyTimes(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} has failed too many times, using fallback`);
    return createFallbackResult(normalizedUrl, "Domain temporarily unavailable", fallbackImageData);
  }

  // If we have stale in-memory cache and should refresh, start background refresh
  if (cached && !skipExternalFetch) {
    debug(
      `[DataAccess/OpenGraph] Using stale memory cache while refreshing in background: ${normalizedUrl}`,
    );

    // Start background refresh but don't await it
    refreshOpenGraphData(normalizedUrl, idempotencyKey, fallbackImageData).catch((error) => {
      console.error(
        `[DataAccess/OpenGraph] Background refresh failed for ${normalizedUrl}:`,
        error,
      );
    });

    return {
      ...cached,
      source: "cache",
    };
  }

  // Try to read from S3 persistent storage if not in memory cache
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`);
    if (stored && typeof stored === "object") {
      const storedResult = stored as OgResult;
      debug(`[DataAccess/OpenGraph] 📁 Found in S3 storage: ${normalizedUrl}`);

      // Update stored result with S3 URLs if available
      const updatedStoredResult = { ...storedResult };

      // Check if we can upgrade external URLs to S3 persisted URLs (non-blocking)
      if (storedResult.imageUrl?.startsWith("http") && isValidImageUrl(storedResult.imageUrl)) {
        const persistedImageKey = await findImageInS3(
          storedResult.imageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );

        if (persistedImageKey) {
          updatedStoredResult.imageUrl = persistedImageKey;
          debug(`[DataAccess/OpenGraph] Upgraded stored image URL to S3: ${persistedImageKey}`);
        } else {
          // Don't block response - schedule background persistence
          debug(
            `[DataAccess/OpenGraph] Image not in S3, scheduling background persistence: ${storedResult.imageUrl}`,
          );
          scheduleImagePersistence(
            storedResult.imageUrl,
            OPENGRAPH_IMAGES_S3_DIR,
            "OpenGraph",
            idempotencyKey,
            normalizedUrl,
          );
        }
      }

      if (
        storedResult.bannerImageUrl?.startsWith("http") &&
        isValidImageUrl(storedResult.bannerImageUrl)
      ) {
        const persistedBannerKey = await findImageInS3(
          storedResult.bannerImageUrl,
          OPENGRAPH_IMAGES_S3_DIR,
          "OpenGraph",
          idempotencyKey,
          normalizedUrl,
        );

        if (persistedBannerKey) {
          updatedStoredResult.bannerImageUrl = persistedBannerKey;
          debug(`[DataAccess/OpenGraph] Upgraded stored banner URL to S3: ${persistedBannerKey}`);
        } else {
          // Don't block response - schedule background persistence
          debug(
            `[DataAccess/OpenGraph] Banner not in S3, scheduling background persistence: ${storedResult.bannerImageUrl}`,
          );
          scheduleImagePersistence(
            storedResult.bannerImageUrl,
            OPENGRAPH_IMAGES_S3_DIR,
            "OpenGraph",
            idempotencyKey,
            normalizedUrl,
          );
        }
      }

      // Store in memory cache and return
      ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedStoredResult, false);
      return updatedStoredResult;
    }
  } catch (error) {
    console.warn(`[DataAccess/OpenGraph] Failed to read from S3 for ${normalizedUrl}:`, error);
  }

  // If skipping external fetch, return what we have or fallback
  if (skipExternalFetch) {
    if (cached) {
      return {
        ...cached,
        source: "cache",
      };
    }
    return createFallbackResult(normalizedUrl, "External fetch disabled", fallbackImageData);
  }

  // Fetch fresh data from external source
  debug(`[DataAccess/OpenGraph] 🌐 Fetching fresh data from external source: ${normalizedUrl}`);
  const freshData = await refreshOpenGraphData(normalizedUrl, idempotencyKey, fallbackImageData);

  if (freshData) {
    return freshData;
  }

  // Final fallback - return memory cached data if available, otherwise create fallback
  if (cached) {
    debug(`[DataAccess/OpenGraph] Using stale memory cache as final fallback: ${normalizedUrl}`);
    return {
      ...cached,
      source: "cache",
    };
  }

  return createFallbackResult(normalizedUrl, "All fetch attempts failed", fallbackImageData);
}

/**
 * Refreshes OpenGraph data from external source and updates S3 persistent storage and in-memory cache
 *
 * @param url - URL to refresh data for
 * @param idempotencyKey - A unique key to ensure idempotent image storage
 * @param fallbackImageData - Optional Karakeep image data to use as fallback when external fetch fails
 * @returns Promise resolving to fresh OpenGraph data or null if failed
 */
async function refreshOpenGraphData(
  url: string,
  idempotencyKey?: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult | null> {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  // Check if fetch is already in progress
  if (inFlightOgPromises.has(normalizedUrl)) {
    debug(`[DataAccess/OpenGraph] Fetch already in progress for: ${normalizedUrl}`);
    const existingPromise = inFlightOgPromises.get(normalizedUrl);
    if (existingPromise) {
      return existingPromise;
    }
  }

  // Helper to persist an image and return its S3 key, or the original URL on failure
  const persistImage = async (imageUrl: string | null | undefined): Promise<string | null> => {
    if (!imageUrl || !isValidImageUrl(imageUrl)) {
      return null;
    }

    try {
      // Check if already persisted to S3 first
      let persistedKey = await findImageInS3(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        url,
      );

      if (persistedKey) {
        debug(`[DataAccess/OpenGraph] Using existing persisted image: ${persistedKey}`);
        return persistedKey;
      }

      // If not, persist it now
      persistedKey = await persistImageToS3(
        imageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        idempotencyKey,
        url,
      );

      if (persistedKey) {
        debug(`[DataAccess/OpenGraph] Persisted new image, using S3 reference: ${persistedKey}`);
        return persistedKey;
      }
    } catch (error) {
      console.error(`[DataAccess/OpenGraph] Failed to persist image ${imageUrl}:`, error);
    }

    // Fallback to original URL if persistence fails
    return imageUrl;
  };

  const fetchPromise = fetchExternalOpenGraphWithRetry(normalizedUrl, fallbackImageData)
    .then(async (result) => {
      if (result) {
        try {
          // Store metadata in S3 persistent storage before image processing
          await writeJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, {
            ...result,
            imageUrl: result.imageUrl,
            bannerImageUrl: result.bannerImageUrl,
          });

          // Persist images to S3 and update URLs to use S3 versions
          const finalImageUrl = (await persistImage(result.imageUrl)) ?? result.imageUrl;
          const finalBannerImageUrl =
            (await persistImage(result.bannerImageUrl)) ?? result.bannerImageUrl;

          // Create the final result with S3 URLs where available
          const finalResult: OgResult = {
            ...result,
            imageUrl: finalImageUrl,
            bannerImageUrl: finalBannerImageUrl,
          };

          // Update memory cache with final result
          ServerCacheInstance.setOpenGraphData(normalizedUrl, finalResult, false);

          debug(
            `[DataAccess/OpenGraph] Successfully refreshed and stored data for: ${normalizedUrl}`,
          );
          return finalResult;
        } catch (storageError) {
          console.error(
            `[DataAccess/OpenGraph] Failed to store data for ${normalizedUrl}:`,
            storageError,
          );
          // Still return the result even if storage failed
          return result;
        }
      } else {
        // Mark as failed in memory cache
        const failureResult = createFallbackResult(
          normalizedUrl,
          "External fetch failed",
          fallbackImageData,
        );
        ServerCacheInstance.setOpenGraphData(normalizedUrl, failureResult, true);

        // Add to circuit breaker using existing session management
        const domain = getDomainType(normalizedUrl);
        markDomainAsFailed(domain);

        return null;
      }
    })
    .finally(() => {
      inFlightOgPromises.delete(normalizedUrl);
    });

  inFlightOgPromises.set(normalizedUrl, fetchPromise);
  return fetchPromise;
}












/**
 * Serves a persisted OpenGraph image from S3 persistent storage
 *
 * @param s3Key - S3 key for the persisted image
 * @returns Promise resolving to image buffer and content type, or null if not found
 */
export async function serveOpenGraphImage(
  s3Key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return serveImageFromS3(s3Key, "OpenGraph");
}
