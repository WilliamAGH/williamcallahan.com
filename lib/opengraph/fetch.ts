/**
 * OpenGraph Fetch Module
 *
 * Handles external HTML fetching with retry logic and circuit breaking
 * Responsible for all networking operations
 * Includes request deduplication to prevent duplicate concurrent fetches
 *
 * @module opengraph/fetch
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { envLogger } from "@/lib/utils/env-logger";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import {
  getCachedJinaHtml,
  persistJinaHtmlInBackground,
  scheduleImagePersistence,
  persistImageAndGetS3Url,
} from "@/lib/persistence/s3-persistence";
import { fetchWithTimeout, getBrowserHeaders } from "@/lib/utils/http-client";
import { incrementAndPersist, waitForPermit } from "@/lib/rate-limiter";
import { retryWithThrow, RETRY_CONFIGS } from "@/lib/utils/retry";
import {
  JINA_FETCH_CONFIG,
  JINA_FETCH_STORE_NAME,
  JINA_FETCH_CONTEXT_ID,
  JINA_FETCH_RATE_LIMIT_S3_PATH,
} from "@/lib/constants";
import { getDomainType } from "@/lib/utils/opengraph-utils";
import { sanitizeOgMetadata } from "@/lib/utils/opengraph-utils";
import { ogMetadataSchema, type ValidatedOgMetadata } from "@/types/seo/opengraph";
import {
  OPENGRAPH_FETCH_CONFIG,
  OPENGRAPH_FETCH_CONTEXT_ID,
  OPENGRAPH_FETCH_STORE_NAME,
  DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
  OPENGRAPH_IMAGES_S3_DIR,
} from "@/lib/constants";
import { extractOpenGraphTags } from "./parser";
import { selectBestImage } from "@/lib/bookmarks/bookmark-helpers";
import type { OgResult, KarakeepImageFallback } from "@/types";

/**
 * In-memory map to track ongoing OpenGraph fetch requests
 * Used for request deduplication to prevent duplicate fetches
 */
const ongoingRequests = new Map<string, Promise<OgResult | { networkFailure: true; lastError: Error | null } | null>>();

/**
 * Fetches OpenGraph data from external source with retry logic and request deduplication
 *
 * @param url - URL to fetch
 * @param fallbackImageData - Optional Karakeep fallback data
 * @returns Promise resolving to OpenGraph result or null if failed
 */
export async function fetchExternalOpenGraphWithRetry(
  url: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult | { networkFailure: true; lastError: Error | null } | null> {
  // Check if there's already an ongoing request for this URL
  const cacheKey = `${url}:${fallbackImageData?.idempotencyKey || "default"}`;
  const existingRequest = ongoingRequests.get(cacheKey);
  if (existingRequest) {
    debug(`[OpenGraph Dedup] Returning existing request for URL: ${url}`);
    return existingRequest;
  }

  // Create new request promise and store it
  const requestPromise = performFetchWithRetry(url, fallbackImageData);
  ongoingRequests.set(cacheKey, requestPromise);

  // Clean up the map entry when request completes
  void requestPromise.finally(() => {
    ongoingRequests.delete(cacheKey);
    debug(`[OpenGraph Dedup] Cleaned up request for URL: ${url}`);
  });

  return requestPromise;
}

/**
 * Internal function that performs the actual fetch with retry logic
 * Separated to support request deduplication
 */
async function performFetchWithRetry(
  url: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult | { networkFailure: true; lastError: Error | null } | null> {
  const originalUrl = new URL(url);
  const isTwitter = originalUrl.hostname.endsWith("twitter.com") || originalUrl.hostname.endsWith("x.com");
  // Only use vxtwitter.com - fxtwitter.com returns empty metadata for profiles as of 2025
  const proxies = isTwitter ? ["vxtwitter.com"] : [];

  try {
    // Use the shared retry utility with custom logic for OpenGraph
    const result = await retryWithThrow(
      async () => {
        let lastAttemptError: Error | null = null;

        // Try direct fetch first, then proxies
        const urlsToTry = [
          url,
          ...proxies.map((proxy) => {
            const proxyUrl = new URL(url);
            proxyUrl.hostname = proxy;
            return proxyUrl.toString();
          }),
        ];

        for (const effectiveUrl of urlsToTry) {
          const isProxy = effectiveUrl !== url;
          if (isProxy) {
            console.log(
              `[OpenGraph Proxy] Trying ${new URL(effectiveUrl).hostname} for ${url.includes("/status/") ? "tweet" : "profile"}: ${effectiveUrl}`,
            );
          } else {
            console.log(`[OpenGraph Direct] Attempting direct fetch for: ${url}`);
          }

          try {
            const result = await fetchExternalOpenGraph(effectiveUrl, fallbackImageData);

            if (result && typeof result === "object" && "permanentFailure" in result) {
              console.log(
                `[OpenGraph Crawl] ❌ Permanent failure (${result.status}) for ${effectiveUrl}, trying next option`,
              );
              continue;
            }

            if (result && typeof result === "object" && "blocked" in result) {
              console.log(`[OpenGraph Crawl] 🚫 Access blocked for ${effectiveUrl}, trying next option`);
              continue;
            }

            if (result && !("permanentFailure" in result) && !("blocked" in result)) {
              // Check if we actually got meaningful data
              const hasValidData = result.title || result.description || result.imageUrl;

              if (hasValidData) {
                console.log(`[OpenGraph Crawl] ✅ Successfully crawled ${url}`);
                console.log(
                  `[OpenGraph Crawl] 📊 Extracted data: title="${result.title}", description="${result.description?.substring(0, 100)}...", imageUrl="${result.imageUrl}"`,
                );
                return result; // Success!
              } else {
                console.log(
                  `[OpenGraph Crawl] ⚠️ Empty metadata from ${isProxy ? "proxy" : "direct fetch"} for ${url}, trying next option`,
                );
              }
            }
          } catch (error: unknown) {
            lastAttemptError = error instanceof Error ? error : new Error(String(error));
            debugWarn(`[DataAccess/OpenGraph] Failed to fetch ${effectiveUrl}:`, lastAttemptError.message);
          }
        }

        // All attempts failed
        throw lastAttemptError || new Error("All OpenGraph fetch attempts failed");
      },
      {
        ...RETRY_CONFIGS.OPENGRAPH_FETCH,
        onRetry: (error: unknown, attempt: number) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          debug(`[OpenGraph Retry] Attempt ${attempt} after error: ${errorMessage}`);
        },
      },
    );

    return result;
  } catch (finalError: unknown) {
    // retryWithOptions failed - handle the error
    const error = finalError instanceof Error ? finalError : new Error(String(finalError));
    const errorMessage = error.message;

    const isNetworkError =
      errorMessage.includes("fetch failed") ||
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("timeout") ||
      errorMessage.includes("ECONNREFUSED");

    if (isNetworkError) {
      debug(`[DataAccess/OpenGraph] Final network connectivity issue for ${url}: ${errorMessage}`);
    } else {
      console.error(`[DataAccess/OpenGraph] Final unexpected error for ${url}:`, errorMessage);
    }

    return { networkFailure: true, lastError: error };
  }
}

/**
 * Fetches OpenGraph data from a single external source
 *
 * @param url - URL to fetch
 * @param fallbackImageData - Optional Karakeep fallback data
 * @param attempt - Current attempt number for retry logic
 * @param headers - HTTP headers to use for the request
 * @returns Promise resolving to OpenGraph result or special status object
 */
async function fetchExternalOpenGraph(
  url: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult | { permanentFailure: true; status: number } | { blocked: true; status: number } | null> {
  const domain = getDomainType(url);
  const imageService = getUnifiedImageService();
  if (imageService.hasDomainFailedTooManyTimes(domain)) {
    debugWarn(`[DataAccess/OpenGraph] Skipping ${url} - domain ${domain} has failed too many times`);
    return null;
  }

  let html = "";
  let finalUrl = url;

  // 1. Check for cached Jina HTML in S3 first
  const cachedHtml = await getCachedJinaHtml(url);
  if (cachedHtml) {
    html = cachedHtml;
  } else {
    // 2. If not cached, attempt to use Jina AI Reader if allowed
    if (
      incrementAndPersist(
        JINA_FETCH_STORE_NAME,
        JINA_FETCH_CONTEXT_ID,
        JINA_FETCH_CONFIG,
        JINA_FETCH_RATE_LIMIT_S3_PATH,
      )
    ) {
      try {
        debug(`[DataAccess/OpenGraph] Attempting to fetch with Jina AI Reader: ${url}`);
        const jinaResponse = await global.fetch(`https://r.jina.ai/${url}`, {
          headers: { "X-Return-Format": "html" },
        });

        if (jinaResponse.ok) {
          html = await jinaResponse.text();
          finalUrl = jinaResponse.url;
          console.log(
            `[OpenGraph Crawl] 🌐 Successfully fetched HTML via Jina AI Reader (${html.length} bytes) from: ${url}`,
          );
          // Persist the successful Jina response to S3 in the background
          persistJinaHtmlInBackground(url, html);
        } else {
          throw new Error(`Jina AI Reader failed with status: ${jinaResponse.status}`);
        }
      } catch (jinaError) {
        debugWarn(`[DataAccess/OpenGraph] Jina AI Reader failed for ${url}:`, jinaError);
        // Fall through to direct fetch
      }
    } else {
      debugWarn(`[DataAccess/OpenGraph] Jina AI fetch skipped due to global rate limit for ${url}`);
    }
  }

  // If Jina fetch was skipped or failed, use direct fetch
  if (!html) {
    debug(`[DataAccess/OpenGraph] Falling back to direct fetch for ${url}`);

    try {
      await waitForPermit(OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG);

      // Use shared fetch utility with timeout and browser headers
      const headers = getBrowserHeaders();
      const response = await fetchWithTimeout(url, {
        timeout: OPENGRAPH_FETCH_CONFIG.TIMEOUT,
        headers: {
          ...headers,
          // Try Googlebot UA if we've had issues before
          ...(imageService.hasDomainFailedTooManyTimes(domain)
            ? { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }
            : {}),
        },
      });

      if (response.status === 404 || response.status === 410) {
        return { permanentFailure: true, status: response.status };
      }
      if (response.status === 403) {
        return { blocked: true, status: 403 };
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      html = await response.text();
      finalUrl = response.url;
      debug(`[DataAccess/OpenGraph] Successfully fetched HTML via direct fetch (${html.length} bytes) from: ${url}`);
    } catch (fetchError) {
      imageService.markDomainAsFailed(domain);
      throw fetchError;
    }
  }

  // Common processing logic for HTML from either source
  const ogMetadata = extractOpenGraphTags(html, url, fallbackImageData);
  const sanitizedMetadata = sanitizeOgMetadata(ogMetadata);
  const validationResult = ogMetadataSchema.safeParse(sanitizedMetadata);
  const validatedMetadata: ValidatedOgMetadata = validationResult.success
    ? validationResult.data
    : {
        title: null,
        description: null,
        image: null,
        twitterImage: null,
        site: null,
        type: null,
        profileImage: null,
        bannerImage: null,
        url: null,
        siteName: null,
      };

  // Use centralized image selection logic - for OpenGraph fetch, we don't have content yet
  const ogImageValue = validatedMetadata.image || validatedMetadata.profileImage || validatedMetadata.twitterImage;
  const bestImageUrlRaw = selectBestImage(
    { ogImage: ogImageValue || undefined, content: undefined },
    { includeScreenshots: false, returnUndefined: true },
  );
  const bestImageUrl: string | undefined = bestImageUrlRaw === null ? undefined : bestImageUrlRaw;

  // Log what we found
  console.log(`[DataAccess/OpenGraph] Image selection for ${url}:`);
  console.log(`[DataAccess/OpenGraph]   Best image URL: ${bestImageUrl || "NONE FOUND"}`);
  console.log(`[DataAccess/OpenGraph]   Fallback data provided: ${fallbackImageData ? "YES" : "NO"}`);
  console.log(`[DataAccess/OpenGraph]   Idempotency key: ${fallbackImageData?.idempotencyKey || "NONE"}`);

  // Handle image persistence
  let finalImageUrl = bestImageUrl;
  let finalProfileImageUrl = validatedMetadata.profileImage || undefined;
  let finalBannerImageUrl = validatedMetadata.bannerImage || undefined;

  // Check if we're in batch mode (data updater)
  const isBatchMode = process.env.IS_DATA_UPDATER === "true";

  // Persist main OpenGraph image
  if (bestImageUrl && fallbackImageData?.idempotencyKey) {
    if (isBatchMode) {
      // In batch mode, persist synchronously and get S3 URL
      console.log(`[DataAccess/OpenGraph] 🔄 Batch mode: Persisting image synchronously for: ${bestImageUrl}`);
      const s3Url = await persistImageAndGetS3Url(
        bestImageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        fallbackImageData.idempotencyKey,
        url,
      );

      if (s3Url) {
        finalImageUrl = s3Url;
        console.log(`[DataAccess/OpenGraph] ✅ Image persisted to S3, using S3 URL: ${s3Url}`);
      } else {
        console.error(`[DataAccess/OpenGraph] ❌ Failed to persist image to S3, keeping original URL: ${bestImageUrl}`);
      }
    } else {
      // In runtime mode, schedule background persistence
      console.log(
        `[DataAccess/OpenGraph] 📋 Runtime mode: Scheduling background image persistence for: ${bestImageUrl}`,
      );
      scheduleImagePersistence(
        bestImageUrl,
        OPENGRAPH_IMAGES_S3_DIR,
        "OpenGraph",
        fallbackImageData.idempotencyKey,
        url,
      );
    }
  } else {
    if (!bestImageUrl) {
      envLogger.log(`No image found to persist`, { url }, { category: "OpenGraph" });
    } else if (!fallbackImageData?.idempotencyKey) {
      envLogger.log(`No idempotencyKey provided, cannot persist image`, { bestImageUrl }, { category: "OpenGraph" });
    }
  }

  // Persist profile image if available
  if (validatedMetadata.profileImage && fallbackImageData?.idempotencyKey) {
    const profileImageUrl = validatedMetadata.profileImage;
    console.log(`[DataAccess/OpenGraph] 👤 Found profile image: ${profileImageUrl}`);

    // Determine platform-specific directory for better organization
    const domain = getDomainType(url);
    let profileImageDirectory = "social-avatars";
    if (domain === "github.com") {
      profileImageDirectory = "social-avatars/github";
    } else if (domain === "twitter.com" || domain === "x.com") {
      profileImageDirectory = "social-avatars/twitter";
    } else if (domain === "linkedin.com") {
      profileImageDirectory = "social-avatars/linkedin";
    } else if (domain === "bsky.app") {
      profileImageDirectory = "social-avatars/bluesky";
    } else if (domain === "discord.com") {
      profileImageDirectory = "social-avatars/discord";
    }

    if (isBatchMode) {
      console.log(
        `[DataAccess/OpenGraph] 🔄 Batch mode: Persisting profile image synchronously to ${profileImageDirectory}`,
      );
      const s3ProfileUrl = await persistImageAndGetS3Url(
        profileImageUrl,
        profileImageDirectory,
        "ProfileImage",
        `profile-${fallbackImageData.idempotencyKey}`,
        url,
      );

      if (s3ProfileUrl) {
        finalProfileImageUrl = s3ProfileUrl;
        console.log(`[DataAccess/OpenGraph] ✅ Profile image persisted to S3: ${s3ProfileUrl}`);
      } else {
        console.error(
          `[DataAccess/OpenGraph] ❌ Failed to persist profile image, keeping original: ${profileImageUrl}`,
        );
      }
    } else {
      console.log(
        `[DataAccess/OpenGraph] 📋 Runtime mode: Scheduling profile image persistence to ${profileImageDirectory}`,
      );
      scheduleImagePersistence(
        profileImageUrl,
        profileImageDirectory,
        "ProfileImage",
        `profile-${fallbackImageData.idempotencyKey}`,
        url,
      );
    }
  }

  // Persist banner image if available
  if (validatedMetadata.bannerImage && fallbackImageData?.idempotencyKey) {
    const bannerImageUrl = validatedMetadata.bannerImage;
    console.log(`[DataAccess/OpenGraph] 🎨 Found banner image: ${bannerImageUrl}`);

    if (isBatchMode) {
      console.log(`[DataAccess/OpenGraph] 🔄 Batch mode: Persisting banner image synchronously`);
      const s3BannerUrl = await persistImageAndGetS3Url(
        bannerImageUrl,
        "social-banners",
        "BannerImage",
        `banner-${fallbackImageData.idempotencyKey}`,
        url,
      );

      if (s3BannerUrl) {
        finalBannerImageUrl = s3BannerUrl;
        console.log(`[DataAccess/OpenGraph] ✅ Banner image persisted to S3: ${s3BannerUrl}`);
      } else {
        console.error(`[DataAccess/OpenGraph] ❌ Failed to persist banner image, keeping original: ${bannerImageUrl}`);
      }
    } else {
      console.log(`[DataAccess/OpenGraph] 📋 Runtime mode: Scheduling banner image persistence`);
      scheduleImagePersistence(
        bannerImageUrl,
        "social-banners",
        "BannerImage",
        `banner-${fallbackImageData.idempotencyKey}`,
        url,
      );
    }
  }

  const result: OgResult = {
    url: finalUrl,
    finalUrl: finalUrl !== url ? finalUrl : undefined,
    title: validatedMetadata.title || undefined,
    description: validatedMetadata.description || undefined,
    imageUrl: finalImageUrl || null,
    bannerImageUrl: finalBannerImageUrl || null,
    profileImageUrl: finalProfileImageUrl || null,
    siteName: validatedMetadata.siteName || undefined,
    timestamp: Date.now(),
    source: "external",
  };

  debug(`[DataAccess/OpenGraph] Extracted metadata for ${url}:`, {
    title: validatedMetadata.title,
    imageUrl: result.imageUrl,
    bannerImageUrl: result.bannerImageUrl,
    profileImageUrl: result.profileImageUrl,
  });

  return result;
}
