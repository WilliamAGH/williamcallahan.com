import { envLogger } from "@/lib/utils/env-logger";
import { getMonotonicTime } from "@/lib/utils";
/**
 * OpenGraph Data Access Module
 *
 * Orchestrates fetching, caching, and serving of OpenGraph metadata
 * Access pattern: In-memory Cache → S3 Storage → External APIs
 * Provides resilient OpenGraph data retrieval with comprehensive error handling
 *
 * @module data-access/opengraph
 */

import { USE_NEXTJS_CACHE } from "@/lib/cache";
import { readJsonS3 } from "@/lib/s3/json";
import { ServerCacheInstance } from "@/lib/server-cache";
import { debug } from "@/lib/utils/debug";
import { getS3Override } from "@/lib/persistence/s3-persistence";
import { serveImageFromS3 } from "@/lib/image-handling/image-s3-utils";
import { getDomainType, hashUrl, normalizeUrl, validateOgUrl } from "@/lib/utils/opengraph-utils";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import {
  OPENGRAPH_S3_KEY_DIR,
  OPENGRAPH_METADATA_S3_DIR,
  OPENGRAPH_IMAGES_S3_DIR,
  OPENGRAPH_CACHE_DURATION,
} from "@/lib/constants";
import { createFallbackResult } from "@/lib/opengraph/fallback";
import { S3NotFoundError } from "@/lib/s3/errors";
import type { OgResult } from "@/types";
import { isOgResult, OgError } from "@/types/opengraph";
import { karakeepImageFallbackSchema, ogResultSchema } from "@/types/seo/opengraph";
import { getCachedOpenGraphDataInternal } from "./opengraph-next-cache";
import { isCliLikeContext, safeRevalidateTag } from "./opengraph-cache-context";
import { refreshOpenGraphData } from "./opengraph-refresh";

// Re-export constants for backwards compatibility
export { OPENGRAPH_S3_KEY_DIR, OPENGRAPH_METADATA_S3_DIR, OPENGRAPH_IMAGES_S3_DIR };

const isProductionBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const getOgTimestamp = (): number => (isProductionBuildPhase ? 0 : getMonotonicTime());

/**
 * Retrieves OpenGraph data using a multi-layered approach for optimal performance
 *
 * **Retrieval order:**
 * 1. **Next.js Cache** (when enabled) - Native caching with automatic invalidation
 * 2. **Memory cache** (legacy) - In-memory storage for immediate reuse
 * 3. **S3 persistent storage** (fast) - Durable storage surviving server restarts
 * 4. **External API** (slowest) - Fresh fetch from source URL
 *
 * **Image Strategy:**
 * Images already in S3 are served directly from CDN without additional caching
 *
 * @param url - URL to get OpenGraph data for
 * @param skipExternalFetch - If true, only check caches and S3 persistent storage
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
  const validatedFallback = fallbackImageData
    ? karakeepImageFallbackSchema.safeParse(fallbackImageData).data
    : undefined;

  // Use Next.js cache when enabled and in a Next.js request context (not CLI)
  if (USE_NEXTJS_CACHE && !isCliLikeContext()) {
    return getCachedOpenGraphDataInternal({
      normalizedUrl,
      skipExternalFetch,
      idempotencyKey,
      validatedFallback,
      getOgTimestamp,
      refreshOpenGraphData,
    });
  }

  // Legacy path - still using ServerCacheInstance
  const urlHash = hashUrl(normalizedUrl);

  debug(`[DataAccess/OpenGraph] 🔍 Getting OpenGraph data for: ${normalizedUrl}`);

  // PRIORITY LEVEL 1: Check for S3 override first
  debug(`[OG-Priority-1] 🔍 Checking S3 override for: ${normalizedUrl}`);
  const s3Override = await getS3Override(normalizedUrl);
  if (s3Override) {
    debug(`[OG-Priority-1] ✅ Found S3 override: ${normalizedUrl}`);
    return s3Override;
  }
  debug(`[OG-Priority-1] ❌ No S3 override found for: ${normalizedUrl}`);

  // Validate URL first
  if (!validateOgUrl(normalizedUrl)) {
    envLogger.log("Invalid or unsafe URL", { url: normalizedUrl }, { category: "OpenGraph" });
    return createFallbackResult(normalizedUrl, "Invalid or unsafe URL", validatedFallback);
  }

  // PRIORITY LEVEL 2: Check metadata cache first
  debug(`[OG-Priority-2] 🔍 Checking metadata cache for: ${normalizedUrl}`);
  const cached = ServerCacheInstance.getOpenGraphData(normalizedUrl);
  if (
    cached &&
    getOgTimestamp() - (cached.data.timestamp ?? 0) < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000
  ) {
    debug(`[OG-Priority-2] ✅ Found valid metadata cache for: ${normalizedUrl}`);

    // Validate cached data integrity
    if (
      !cached.data.url ||
      !cached.data.title ||
      (cached.data.error && typeof cached.data.error !== "string")
    ) {
      envLogger.log(
        "Cached data appears corrupted, invalidating cache",
        { url: normalizedUrl },
        { category: "OpenGraph" },
      );
      ServerCacheInstance.deleteOpenGraphData(normalizedUrl);
      // Continue to S3/external fetch
    } else {
      // Return cached data directly - S3 images don't need processing
      return cached.data;
    }
  }
  debug(`[OG-Priority-2] ❌ No valid metadata cache found for: ${normalizedUrl}`);

  // Check circuit breaker using unified image service session management
  const domain = getDomainType(normalizedUrl);
  const imageService = getUnifiedImageService();
  if (imageService.hasDomainFailedTooManyTimes(domain)) {
    debug(`[DataAccess/OpenGraph] Domain ${domain} has failed too many times, using fallback`);
    return createFallbackResult(normalizedUrl, "Domain temporarily unavailable", validatedFallback);
  }

  // If we have stale in-memory cache and should refresh, start background refresh
  if (cached && !skipExternalFetch) {
    debug(
      `[DataAccess/OpenGraph] Using stale metadata cache while refreshing in background: ${normalizedUrl}`,
    );

    refreshOpenGraphData(normalizedUrl, idempotencyKey, validatedFallback).catch((error) => {
      const ogError = new OgError(`Background refresh failed for ${normalizedUrl}`, "refresh", {
        originalError: error,
      });
      envLogger.log(
        `Background refresh failed`,
        {
          url: normalizedUrl,
          errorName: ogError.name,
          errorMessage: ogError.message,
          originalErrorMessage: error instanceof Error ? error.message : String(error),
        },
        { category: "OpenGraph" },
      );
    });

    return {
      ...cached.data,
      source: "cache",
    };
  }

  // PRIORITY LEVEL 3: Try to read from S3 persistent storage if not in memory cache
  debug(`[OG-Priority-3] 🔍 Checking S3 persistent storage for: ${normalizedUrl}`);
  try {
    const stored = await readJsonS3(`${OPENGRAPH_METADATA_S3_DIR}/${urlHash}.json`, ogResultSchema);
    if (isOgResult(stored)) {
      // Check if S3 data is fresh enough
      const isDataFresh =
        stored.timestamp &&
        getOgTimestamp() - stored.timestamp < OPENGRAPH_CACHE_DURATION.SUCCESS * 1000;

      if (!isDataFresh) {
        debug(
          `[OG-Priority-3] ❌ Found STALE S3 storage (age: ${Math.round((getOgTimestamp() - (stored.timestamp || 0)) / 1000)}s), continuing to Priority 4: ${normalizedUrl}`,
        );
        // Continue to Priority 4 by not returning here
      } else {
        debug(
          `[OG-Priority-3] ✅ Found FRESH S3 storage: ${normalizedUrl} (age: ${Math.round((getOgTimestamp() - (stored.timestamp || 0)) / 1000)}s)`,
        );

        // Store in memory cache and return - S3 images are served directly
        ServerCacheInstance.setOpenGraphData(normalizedUrl, stored, false);
        return stored;
      }
    }
    debug(`[OG-Priority-3] ❌ No valid data in S3 storage for: ${normalizedUrl}`);
  } catch (e) {
    if (e instanceof S3NotFoundError) {
      debug(`[OG-Priority-3] ❌ Not found in S3 storage: ${normalizedUrl}`);
    } else {
      const error = e instanceof Error ? e : new Error(String(e));
      debug(`[OG-Priority-3] ❌ S3 read error for: ${normalizedUrl} - ${error.message}`);
    }
  }

  // If skipping external fetch, return fallback now
  if (skipExternalFetch) {
    debug(
      `[DataAccess/OpenGraph] 🚫 Skipping external fetch, returning fallback: ${normalizedUrl}`,
    );
    return createFallbackResult(normalizedUrl, "Skipped external fetch", validatedFallback);
  }

  // PRIORITY LEVEL 4: Fetch from external source if not in cache or S3
  debug(`[OG-Priority-4] 🔍 Attempting external OpenGraph fetch for: ${normalizedUrl}`);
  const externalResult = await refreshOpenGraphData(
    normalizedUrl,
    idempotencyKey,
    validatedFallback,
  );

  if (externalResult) {
    debug(`[OG-Priority-4] ✅ External OpenGraph fetch succeeded for: ${normalizedUrl}`);
    return externalResult;
  }

  // If all else fails, return a basic fallback
  debug(`[OG-Priority-4] ❌ External OpenGraph fetch failed for: ${normalizedUrl}`);
  debug(`[OG-Fallback] 🔄 Moving to Karakeep fallback chain for: ${normalizedUrl}`);
  return createFallbackResult(normalizedUrl, "External source unavailable", validatedFallback);
}

/**
 * Serve an OpenGraph image from S3 storage
 *
 * @param s3Key - S3 key for the image
 * @returns Promise resolving to image buffer and content type, or null if not found
 */
export async function serveOpenGraphImage(
  s3Key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  return serveImageFromS3(s3Key, "OpenGraph");
}

/**
 * Invalidate all OpenGraph cache entries
 * Note: This clears the base "opengraph" tag. URL-specific tags like "opengraph-${url}"
 * are not individually tracked, but clearing the base tag should invalidate the entire category.
 * For granular invalidation of specific URLs, use invalidateOpenGraphCacheForUrl()
 */
export function invalidateOpenGraphCache(): void {
  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("OpenGraph", "opengraph");
    envLogger.log("Cache invalidated for all OpenGraph data", undefined, { category: "OpenGraph" });
  } else {
    // Legacy: clear memory cache
    ServerCacheInstance.deleteOpenGraphData("*");
    envLogger.log("Legacy cache cleared for all OpenGraph data", undefined, {
      category: "OpenGraph",
    });
  }
}

/**
 * Invalidate OpenGraph cache for a specific URL
 */
export function invalidateOpenGraphCacheForUrl(url: string): void {
  const normalizedUrl = normalizeUrl(url);
  const urlHash = hashUrl(normalizedUrl);

  if (USE_NEXTJS_CACHE) {
    safeRevalidateTag("OpenGraph", `opengraph-${urlHash}`);
    envLogger.log("Cache invalidated for URL", { url: normalizedUrl }, { category: "OpenGraph" });
  } else {
    // Legacy: clear specific entry from memory cache
    ServerCacheInstance.deleteOpenGraphData(normalizedUrl);
    envLogger.log(
      "Legacy cache cleared for URL",
      { url: normalizedUrl },
      { category: "OpenGraph" },
    );
  }
}
