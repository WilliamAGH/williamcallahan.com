/**
 * OpenGraph Fetch Module
 *
 * Handles external HTML fetching with retry logic and circuit breaking
 * Responsible for all networking operations
 *
 * @module opengraph/fetch
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { getUnifiedImageService, UnifiedImageService } from "@/lib/services/unified-image-service";
import { getCachedJinaHtml, persistJinaHtmlInBackground } from "@/lib/opengraph/persistence";
import { incrementAndPersist } from "@/lib/rate-limiter";
import {
  JINA_FETCH_CONFIG,
  JINA_FETCH_STORE_NAME,
  JINA_FETCH_CONTEXT_ID,
  JINA_FETCH_RATE_LIMIT_S3_PATH,
} from "@/lib/constants";
import { scheduleImagePersistence, persistImageAndGetS3Url } from "@/lib/opengraph/persistence";
import { waitForPermit } from "@/lib/rate-limiter";
import { calculateBackoffDelay, getDomainType, shouldRetryUrl } from "@/lib/utils/opengraph-utils";
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
import { selectBestOpenGraphImage } from "@/lib/image-handling/image-selector";
import type { OgResult, KarakeepImageFallback } from "@/types";

/**
 * Fetches OpenGraph data from external source with retry logic
 *
 * @param url - URL to fetch
 * @param fallbackImageData - Optional Karakeep fallback data
 * @returns Promise resolving to OpenGraph result or null if failed
 */
export async function fetchExternalOpenGraphWithRetry(
  url: string,
  fallbackImageData?: KarakeepImageFallback,
): Promise<OgResult | { networkFailure: true; lastError: Error | null } | null> {
  const originalUrl = new URL(url);
  const isTwitter = originalUrl.hostname.endsWith("twitter.com") || originalUrl.hostname.endsWith("x.com");
  const proxies = isTwitter ? ["fxtwitter.com", "vxtwitter.com"] : [null];

  let lastError: Error | null = null;

  for (const proxy of proxies) {
    let effectiveUrl = url;
    if (proxy) {
      const proxyUrl = new URL(url);
      proxyUrl.hostname = proxy;
      effectiveUrl = proxyUrl.toString();
      debug(`[DataAccess/OpenGraph] Using proxy for Twitter URL: ${effectiveUrl}`);
    }

    let headers = UnifiedImageService.getBrowserHeaders();

    for (let attempt = 0; attempt < OPENGRAPH_FETCH_CONFIG.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = calculateBackoffDelay(
            attempt - 1,
            OPENGRAPH_FETCH_CONFIG.BACKOFF_BASE,
            OPENGRAPH_FETCH_CONFIG.MAX_BACKOFF,
          );
          debug(`[DataAccess/OpenGraph] Retry attempt ${attempt} for ${effectiveUrl} after ${delay}ms delay`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const result = await fetchExternalOpenGraph(effectiveUrl, fallbackImageData, headers);

        if (result && typeof result === "object" && "permanentFailure" in result) {
          console.log(
            `[OpenGraph Crawl] ❌ Permanent failure (${result.status}) for ${effectiveUrl}, stopping retries`,
          );
          // Break inner loop and try next proxy if available
          break;
        }

        if (result && typeof result === "object" && "blocked" in result) {
          if (attempt === 0) {
            console.log(`[OpenGraph Crawl] 🚫 Access blocked for ${effectiveUrl}, retrying with Googlebot UA`);
            headers = {
              ...headers,
              "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            };
            // This continue is for the inner loop, which should be fine.
            continue;
          }
          console.log(
            `[OpenGraph Crawl] 🚫 Still blocked after Googlebot retry for ${effectiveUrl}, treating as permanent failure`,
          );
          // Break inner loop and try next proxy
          break;
        }

        if (result && !("permanentFailure" in result) && !("blocked" in result)) {
          console.log(`[OpenGraph Crawl] ✅ Successfully crawled ${url} on attempt ${attempt + 1}`);
          console.log(
            `[OpenGraph Crawl] 📊 Extracted data: title="${result.title}", description="${result.description?.substring(0, 100)}...", imageUrl="${result.imageUrl}"`,
          );
          return result; // Success!
        }
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        debugWarn(`[DataAccess/OpenGraph] Attempt ${attempt + 1} failed for ${effectiveUrl}:`, lastError.message);

        if (!shouldRetryUrl(lastError)) {
          debug(`[DataAccess/OpenGraph] Non-retryable error, stopping attempts for ${effectiveUrl}`);
          // Break inner loop and try next proxy
          break;
        }

        // If we get a network error on the first attempt, try again with Googlebot UA
        if (
          attempt === 0 &&
          (lastError.message.includes("fetch failed") ||
            lastError.message.includes("ENOTFOUND") ||
            lastError.message.includes("timeout") ||
            lastError.message.includes("ECONNREFUSED"))
        ) {
          debug(`[DataAccess/OpenGraph] Network error for ${effectiveUrl}, retrying with Googlebot UA`);
          headers = {
            ...headers,
            "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          };
        }
      }
    } // End of retry loop

    // If we are here, it means all retries for the current proxy failed.
    // The outer loop will now proceed to the next proxy, if any.
  } // End of proxy loop

  // If we've exhausted all proxies and retries, return a failure.
  if (lastError) {
    const isNetworkError =
      lastError.message.includes("fetch failed") ||
      lastError.message.includes("ENOTFOUND") ||
      lastError.message.includes("timeout") ||
      lastError.message.includes("ECONNREFUSED");

    if (isNetworkError) {
      debug(`[DataAccess/OpenGraph] Final network connectivity issue for ${url}: ${lastError.message}`);
    } else {
      console.error(`[DataAccess/OpenGraph] Final unexpected error for ${url}:`, lastError.message || "Unknown error");
    }
  }

  return { networkFailure: true, lastError };
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
  headers?: Record<string, string>,
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENGRAPH_FETCH_CONFIG.TIMEOUT);

    try {
      await waitForPermit(OPENGRAPH_FETCH_STORE_NAME, OPENGRAPH_FETCH_CONTEXT_ID, DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG);
      const requestHeaders = headers || UnifiedImageService.getBrowserHeaders();
      const response = await fetch(url, {
        method: "GET",
        headers: requestHeaders,
        signal: controller.signal,
        redirect: "follow",
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
      if (fetchError instanceof Error && fetchError.name === "AbortError") {
        const timeoutMessage = `Request timeout after ${OPENGRAPH_FETCH_CONFIG.TIMEOUT}ms`;
        debugWarn(`[DataAccess/OpenGraph] ${timeoutMessage} for ${url}`);
        throw new Error(timeoutMessage);
      }
      imageService.markDomainAsFailed(domain);
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
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

  const bestImageUrl = selectBestOpenGraphImage(validatedMetadata, url);

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
      console.warn(`[DataAccess/OpenGraph] ⚠️ No image found to persist for ${url}`);
    } else if (!fallbackImageData?.idempotencyKey) {
      console.warn(`[DataAccess/OpenGraph] ⚠️ No idempotencyKey provided, cannot persist image: ${bestImageUrl}`);
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
    imageUrl: finalImageUrl,
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
