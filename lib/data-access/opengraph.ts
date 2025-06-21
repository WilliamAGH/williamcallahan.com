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
import { getS3Override } from "@/lib/opengraph/persistence";
import { findImageInS3, serveImageFromS3 } from "@/lib/image-handling/image-s3-utils";
import { getDomainType, hashUrl, isValidImageUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { hasDomainFailedTooManyTimes } from "@/lib/data-access/logos/session";
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

  // PRIORITY LEVEL 1: Check for S3 override first
  console.log(`[OG-Priority-1] 🔍 Checking S3 override for: ${normalizedUrl}`);
  const s3Override = await getS3Override(normalizedUrl);
  if (s3Override) {
    console.log(`[OG-Priority-1] ✅ Found S3 override: ${normalizedUrl}`);
    return s3Override;
  }
  console.log(`[OG-Priority-1] ❌ No S3 override found for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    console.warn(`[DataAccess/OpenGraph] Invalid or unsafe URL: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", validatedFallback);
  }

  // PRIORITY LEVEL 2: Check memory cache first
  console.log(`[OG-Priority-2] 🔍 Checking memory cache for: ${normalizedUrl}`);
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  if (cached && Date.now() - (cached.data.timestamp ?? 0) < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000) {
    console.log(`[OG-Priority-2] ✅ Found valid memory cache for: ${normalizedUrl}`);

    // Validate cached data integrity
    if (!cached.data.url || !cached.data.title || (cached.data.error && typeof cached.data.error !== "string")) {
      console.warn(`[DataAccess/OpenGraph] Cached data for ${normalizedUrl} appears corrupted, invalidating cache`);
      ServerCacheInstance.deleteOpenGraphData(normalizedUrl);
      // Continue to S3/external fetch
    } else {
      const updatedResult: OgResult = { ...cached.data };

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

      if (
        updatedResult.imageUrl !== cached.data.imageUrl ||
        updatedResult.bannerImageUrl !== cached.data.bannerImageUrl
      ) {
        ServerCacheInstance.setOpenGraphData(normalizedUrl, updatedResult, false);
      }

      return updatedResult;
    }
  }
  console.log(`[OG-Priority-2] ❌ No valid memory cache found for: ${normalizedUrl}`);

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
      ...cached.data,
      source: "cache",
    };
  }

  // PRIORITY LEVEL 3: Try to read from S3 persistent storage if not in memory cache
  console.log(`[OG-Priority-3] 🔍 Checking S3 persistent storage for: ${normalizedUrl}`);
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`);
    if (isOgResult(stored)) {
      // Check if S3 data is fresh enough
      const isDataFresh = stored.timestamp && (Date.now() - stored.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000);
      
      if (!isDataFresh) {
        console.log(`[OG-Priority-3] ❌ Found STALE S3 storage (age: ${Math.round((Date.now() - (stored.timestamp || 0)) / 1000)}s), continuing to Priority 4: ${normalizedUrl}`);
        // Continue to Priority 4 by not returning here
      } else {
        console.log(`[OG-Priority-3] ✅ Found FRESH S3 storage: ${normalizedUrl} (age: ${Math.round((Date.now() - (stored.timestamp || 0)) / 1000)}s)`);

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
    }
    console.log(`[OG-Priority-3] ❌ No valid data in S3 storage for: ${normalizedUrl}`);
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    if ("code" in error && error.code === "NoSuchKey") {
      console.log(`[OG-Priority-3] ❌ S3 cache miss for: ${normalizedUrl}`);
    } else {
      console.log(`[OG-Priority-3] ❌ S3 read error for: ${normalizedUrl} - ${error.message}`);
    }
  }

  // If skipping external fetch, return fallback now
  if (skipExternalFetch) {
    debug(`[DataAccess/OpenGraph] 🚫 Skipping external fetch, returning fallback: ${normalizedUrl}`);
    return createFallbackResult(normalizedUrl, "Skipped external fetch", validatedFallback);
  }

  // PRIORITY LEVEL 4: Fetch from external source if not in cache or S3
  console.log(`[OG-Priority-4] 🔍 Attempting external OpenGraph fetch for: ${normalizedUrl}`);
  const externalResult = await refreshOpenGraphData(normalizedUrl, idempotencyKey, validatedFallback);

  if (externalResult) {
    console.log(`[OG-Priority-4] ✅ External OpenGraph fetch succeeded for: ${normalizedUrl}`);
    return externalResult;
  }

  // If all else fails, return a basic fallback
  console.log(`[OG-Priority-4] ❌ External OpenGraph fetch failed for: ${normalizedUrl}`);
  console.log(`[OG-Fallback] 🔄 Moving to Karakeep fallback chain for: ${normalizedUrl}`);
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
      // Check for S3 override first - even during refresh, overrides take precedence
      const s3Override = await getS3Override(normalizedUrl);
      if (s3Override) {
        console.log(
          `[OpenGraph Refresh] 🛡️ S3 override found during refresh, skipping external fetch: ${normalizedUrl}`,
        );
        ServerCacheInstance.setOpenGraphData(normalizedUrl, s3Override, false);
        return s3Override;
      }

      console.log(`[OpenGraph Refresh] 🚀 Starting automatic refresh for: ${normalizedUrl}`);
      const result = await fetchExternalOpenGraphWithRetry(normalizedUrl, validatedFallback);

      // Handle successful result
      if (result && typeof result === "object" && "url" in result) {
        console.log(`[OpenGraph Refresh] ✅ Successfully refreshed: ${normalizedUrl}`);
        const metadataS3Key = `${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`;
        ServerCacheInstance.setOpenGraphData(normalizedUrl, result, false);
        await writeJsonS3(metadataS3Key, result);
        console.log(`[OpenGraph S3] 💾 Persisted refreshed metadata to S3: ${metadataS3Key}`);
        return result;
      }

      // Handle network failure (expected scenario)
      if (result && typeof result === "object" && "networkFailure" in result) {
        console.warn(`[OpenGraph Refresh] 🌐 Network unavailable for: ${normalizedUrl}, using fallback`);
        const fallback = createFallbackResult(normalizedUrl, "Network connectivity issue", validatedFallback);
        // Cache the fallback for a shorter duration to retry sooner
        ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
        return fallback;
      }

      // Handle null result (permanent failure or blocked)
      console.warn(`[OpenGraph Refresh] ❌ External source unavailable for: ${normalizedUrl}`);
      const fallback = createFallbackResult(normalizedUrl, "External source unavailable", validatedFallback);
      ServerCacheInstance.setOpenGraphData(normalizedUrl, fallback, true);
      return fallback;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const ogError = new OgError(`Failed to refresh OpenGraph data for ${normalizedUrl}`, "refresh", {
        originalError: error,
      });
      console.error(`[DataAccess/OpenGraph] ${ogError.message}:`, ogError);

      const fallback = createFallbackResult(normalizedUrl, ogError.message, validatedFallback);
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
 * Serve an OpenGraph image from S3 storage
 *
 * @param s3Key - S3 key for the image
 * @returns Promise resolving to image buffer and content type, or null if not found
 */
export async function serveOpenGraphImage(s3Key: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  return serveImageFromS3(s3Key, "OpenGraph");
}
