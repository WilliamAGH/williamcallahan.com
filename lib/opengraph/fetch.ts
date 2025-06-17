/**
 * OpenGraph Fetch Module
 * 
 * Handles external HTML fetching with retry logic and circuit breaking
 * Responsible for all networking operations
 * 
 * @module opengraph/fetch
 */

import { debug, debugWarn } from "@/lib/utils/debug";
import { getBrowserHeaders } from "@/lib/data-access/logos/external-fetch";
import { hasDomainFailedTooManyTimes, markDomainAsFailed } from "@/lib/data-access/logos/session";
import {
  DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
  waitForPermit,
} from "@/lib/rate-limiter";
import {
  calculateBackoffDelay,
  getDomainType,
  sanitizeOgMetadata,
  shouldRetryUrl,
} from "@/lib/utils/opengraph-utils";
import { OPENGRAPH_FETCH_CONFIG, OPENGRAPH_FETCH_CONTEXT_ID, OPENGRAPH_FETCH_STORE_NAME } from "./constants";
import { extractOpenGraphTags } from "./parser";
import { selectBestOpenGraphImage } from "./imageSelector";
import type { OgResult, KarakeepImageFallback } from "@/types";

/**
 * Fetches OpenGraph data from external source with retry logic
 *
 * @param url - URL to fetch
 * @param fallbackImageData - Optional Karakeep fallback data
 * @returns Promise resolving to OpenGraph result or null if failed
 */
export async function fetchExternalOpenGraphWithRetry(url: string, fallbackImageData?: KarakeepImageFallback): Promise<OgResult | null> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < OPENGRAPH_FETCH_CONFIG.MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delay = calculateBackoffDelay(
          attempt - 1,
          OPENGRAPH_FETCH_CONFIG.BACKOFF_BASE,
          OPENGRAPH_FETCH_CONFIG.MAX_BACKOFF,
        );
        debug(`[DataAccess/OpenGraph] Retry attempt ${attempt} for ${url} after ${delay}ms delay`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      const result = await fetchExternalOpenGraph(url, fallbackImageData);
      if (result) {
        debug(`[DataAccess/OpenGraph] Successfully fetched on attempt ${attempt + 1}: ${url}`);
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      debugWarn(
        `[DataAccess/OpenGraph] Attempt ${attempt + 1} failed for ${url}:`,
        lastError.message,
      );

      // Check if we should retry this error
      if (!shouldRetryUrl(lastError)) {
        debug(
          `[DataAccess/OpenGraph] Non-retryable error, stopping attempts: ${lastError.message}`,
        );
        break;
      }
    }
  }

  console.error(
    `[DataAccess/OpenGraph] All retry attempts exhausted for ${url}. Last error:`,
    lastError?.message,
  );
  return null;
}

/**
 * Fetches OpenGraph data from a single external source
 *
 * @param url - URL to fetch
 * @param fallbackImageData - Optional Karakeep fallback data
 * @returns Promise resolving to OpenGraph result or null if failed
 */
async function fetchExternalOpenGraph(url: string, fallbackImageData?: KarakeepImageFallback): Promise<OgResult | null> {
  // Check circuit breaker before attempting fetch
  const domain = getDomainType(url);
  if (hasDomainFailedTooManyTimes(domain)) {
    debugWarn(
      `[DataAccess/OpenGraph] Skipping ${url} - domain ${domain} has failed too many times`,
    );
    return null;
  }

  const controller = new AbortController();

  // Increase max listeners to handle concurrent requests safely
  // AbortSignal extends EventTarget which has setMaxListeners in Node.js
  if (
    "setMaxListeners" in controller.signal &&
    typeof (controller.signal as { setMaxListeners?: (n: number) => void }).setMaxListeners ===
      "function"
  ) {
    (controller.signal as { setMaxListeners: (n: number) => void }).setMaxListeners(20);
  }

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, OPENGRAPH_FETCH_CONFIG.TIMEOUT);

  try {
    // Wait for permit from rate limiter before making the external call
    await waitForPermit(
      OPENGRAPH_FETCH_STORE_NAME,
      OPENGRAPH_FETCH_CONTEXT_ID,
      DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG,
    );

    // Use existing getBrowserHeaders function from logo system
    const headers = getBrowserHeaders();

    debug(`[DataAccess/OpenGraph] Fetching HTML from: ${url}`);
    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    debug(`[DataAccess/OpenGraph] Successfully fetched HTML (${html.length} bytes) from: ${url}`);

    // Extract OpenGraph metadata
    const ogMetadata = extractOpenGraphTags(html, url, fallbackImageData);
    const sanitizedMetadata = sanitizeOgMetadata(ogMetadata);

    // Select best image based on priority
    const bestImageUrl = selectBestOpenGraphImage(sanitizedMetadata, response.url || url);

    // Create result
    const result: OgResult = {
      imageUrl: bestImageUrl,
      bannerImageUrl: sanitizedMetadata.bannerImage || null,
      ogMetadata: sanitizedMetadata,
      timestamp: Date.now(),
      source: "external",
      actualUrl: response.url !== url ? response.url : undefined,
    };

    debug(`[DataAccess/OpenGraph] Extracted metadata for ${url}:`, {
      title: sanitizedMetadata.title,
      imageUrl: result.imageUrl,
      bannerImageUrl: result.bannerImageUrl,
    });

    return result;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeoutMessage = `Request timeout after ${OPENGRAPH_FETCH_CONFIG.TIMEOUT}ms`;
      debugWarn(`[DataAccess/OpenGraph] ${timeoutMessage} for ${url}`);
      throw new Error(timeoutMessage);
    }

    // Add domain to failed list for circuit breaker
    const domain = getDomainType(url);
    markDomainAsFailed(domain);

    // Log different error types with appropriate detail level
    if (error instanceof Error) {
      if (error.message.includes("fetch failed") || error.message.includes("ENOTFOUND")) {
        debugWarn(`[DataAccess/OpenGraph] Network error for ${url}: Connection failed`);
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        debugWarn(`[DataAccess/OpenGraph] Access denied for ${url}: ${error.message}`);
      } else {
        debugWarn(`[DataAccess/OpenGraph] Error fetching ${url}: ${error.message}`);
      }
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
    // Ensure the controller is properly cleaned up
    if (!controller.signal.aborted) {
      try {
        controller.abort();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}