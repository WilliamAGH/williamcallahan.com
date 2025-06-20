/**
 * Logo data access layer - unified logo fetching, caching & S3 persistence
 *
 * Flow: Memory cache → S3 → External APIs → Placeholder
 * Sources: Google (HD/MD), Clearbit (HD/MD), DuckDuckGo
 * Storage: S3 with source tracking (images/logos/{id}_{source}.{ext})
 *
 * @module lib/data-access/logos
 */

import * as fs from "node:fs/promises";
import path from "node:path";
import { S3_BUCKET } from "@/lib/constants";
import { fetchExternalLogo } from "@/lib/data-access/logos/external-fetch";
import { findLogoInS3, getLogoS3Key } from "@/lib/data-access/logos/s3-operations";
import { ImageMemoryManagerInstance } from "@/lib/image-memory-manager";

import { ServerCacheInstance } from "@/lib/server-cache";
import { writeBinaryS3 } from "@/lib/s3-utils";
import logger from "@/lib/utils/logger";
import type { LogoResult, LogoSource } from "@/types/logo";
import type { ImageSource } from "@/types/image";

// S3 key prefix for logo data - using the same as s3-operations

// Placeholder logo path - using the actual SVG that exists
const PLACEHOLDER_LOGO_PATH = path.join(process.cwd(), "public", "images", "company-placeholder.svg");
// Placeholder logo promise (cached to prevent race conditions)
let placeholderLogoPromise: Promise<Buffer | null> | null = null;

/**
 * Lazily loads the placeholder logo on first access
 * This avoids blocking server startup with synchronous file I/O
 * and prevents race conditions by caching the promise itself
 */
async function getPlaceholderLogoBuffer(): Promise<Buffer | null> {
  // If already loading or loaded, return the cached promise
  if (placeholderLogoPromise) {
    return placeholderLogoPromise;
  }

  // Create and cache the loading promise
  placeholderLogoPromise = (async () => {
    try {
      const buffer = await fs.readFile(PLACEHOLDER_LOGO_PATH);
      logger.info(`[Logos] Placeholder logo loaded from ${PLACEHOLDER_LOGO_PATH}`);
      return buffer;
    } catch (error) {
      logger.warn(`[Logos] Could not load placeholder logo from ${PLACEHOLDER_LOGO_PATH}:`, error);
      // Reset the promise on failure to allow retries
      placeholderLogoPromise = null;
      return null;
    }
  })();

  return placeholderLogoPromise;
}

/**
 * Resets logo session tracking by clearing the server cache.
 * This forces fresh fetches on next request.
 */
export function resetLogoSessionTracking(): void {
  ServerCacheInstance.clearAllLogoFetches();
  logger.debug("[Logos] Logo cache cleared, forcing fresh fetches");
}

/**
 * Invalidates the S3 store for logos, forcing fresh fetches on next request.
 * This is a placeholder for actual cache invalidation logic if needed.
 */
export function invalidateLogoS3Cache(): void {
  // Currently a no-op or can be implemented with a cache-busting mechanism if needed
  logger.debug("[Logos] S3 logo cache invalidated (placeholder operation)");
}

/**
 * Writes a placeholder logo to S3 for a domain after consistent fetch failures.
 * @param domain - The domain for which to write a placeholder logo.
 * @returns Promise resolving to true if successful, false otherwise.
 */
export async function writePlaceholderLogo(domain: string): Promise<boolean> {
  if (!S3_BUCKET) {
    logger.error("[Logos] S3_BUCKET environment variable not set. Cannot write placeholder logo.");
    return false;
  }

  const placeholderBuffer = await getPlaceholderLogoBuffer();
  if (!placeholderBuffer) {
    logger.warn(`[Logos] Placeholder logo buffer not available. Cannot write for domain: ${domain}`);
    return false;
  }

  // Use 'unknown' as source since this is a placeholder after all sources failed
  const s3Key = getLogoS3Key(domain, "unknown", "svg");
  try {
    await writeBinaryS3(s3Key, placeholderBuffer, "image/svg+xml");
    logger.info(`[Logos] Successfully wrote placeholder logo to S3 for domain: ${domain} at key: ${s3Key}`);
    // Cache the placeholder result to avoid repeated writes
    ServerCacheInstance.setLogoFetch(domain, {
      s3Key,
      source: "unknown",
      url: null,
      retrieval: "s3-store",
      contentType: "image/svg+xml",
    });
    return true;
  } catch (error) {
    logger.error(`[Logos] Failed to write placeholder logo to S3 for domain: ${domain} at key: ${s3Key}:`, error);
    return false;
  }
}

/**
 * Reads a logo from S3 for a given domain.
 * This function now searches for logos with source information in the filename.
 * @param domain - The domain for which to read the logo.
 * @returns Promise resolving to a LogoResult if successful, null otherwise.
 */
export async function readLogoFromS3(domain: string): Promise<LogoResult | null> {
  if (!S3_BUCKET) {
    logger.error("[Logos] S3_BUCKET environment variable not set. Cannot read logo.");
    return null;
  }

  // Use the findLogoInS3 function which handles the source-based naming
  try {
    const result = await findLogoInS3(domain);
    if (result) {
      logger.debug(`[Logos] Successfully read logo from S3 for domain: ${domain} with source: ${result.source}`);
      // Determine content type from file extension
      const contentType = result.key.endsWith(".svg") ? "image/svg+xml" : "image/png";

      // Also store this buffer in the in-memory manager for faster access next time
      ImageMemoryManagerInstance.set(result.key, result.buffer, {
        contentType,
        source: "s3",
      });
      const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL
        ? `${process.env.NEXT_PUBLIC_S3_CDN_URL}/${result.key}`
        : undefined;
      return {
        s3Key: result.key,
        source: result.source,
        url: cdnUrl, // Use CDN URL as the primary URL
        cdnUrl,
        retrieval: "s3-store",
        contentType,
        buffer: result.buffer,
      };
    }
    logger.debug(`[Logos] No logo found in S3 for domain: ${domain}`);
    return null;
  } catch (error) {
    logger.debug(`[Logos] Failed to read logo from S3 for domain: ${domain}:`, error);
    return null;
  }
}

/**
 * Writes a logo to S3 for a given domain with source information.
 * @param domain - The domain for which to write the logo.
 * @param buffer - The logo data as a Buffer.
 * @param source - The source of the logo (google, duckduckgo, etc).
 * @param contentType - The MIME type of the logo.
 * @returns Promise resolving to the S3 key if successful, null otherwise.
 */
export async function writeLogoToS3(
  domain: string,
  buffer: Buffer,
  source: LogoSource,
  contentType: string,
): Promise<string | null> {
  if (!process.env.S3_BUCKET) {
    logger.error("[Logos] S3_BUCKET environment variable not set. Cannot write logo.");
    return null;
  }

  if (!source) {
    logger.error(`[Logos] Cannot write logo without source information for domain: ${domain}`);
    return null;
  }

  const ext = contentType === "image/svg+xml" ? "svg" : "png";
  const s3Key = getLogoS3Key(domain, source, ext);
  try {
    await writeBinaryS3(s3Key, buffer, contentType);
    logger.info(`[Logos] Successfully wrote logo to S3 for domain: ${domain} from source: ${source} at key: ${s3Key}`);
    return s3Key;
  } catch (error) {
    logger.error(`[Logos] Failed to write logo to S3 for domain: ${domain} at key: ${s3Key}:`, error);
    return null;
  }
}

/**
 * Gets a logo for a domain, using session caching to avoid redundant fetches.
 * This is a placeholder for the actual fetch logic, which would be integrated here.
 * @param domain - The domain for which to get the logo.
 * @param fetchFunction - The function to call for fetching the logo if not in cache.
 * @returns Promise resolving to a LogoResult if successful, null otherwise.
 */
export async function getLogoWithCache(
  domain: string,
  fetchFunction: (domain: string) => Promise<LogoResult | null>,
): Promise<LogoResult | null> {
  const serverCache = ServerCacheInstance;
  const imageMemoryManager = ImageMemoryManagerInstance;

  // 1. Check ServerCache for metadata
  const cachedMetadata = serverCache.getLogoFetch(domain);
  if (cachedMetadata) {
    if (cachedMetadata.error) {
      logger.debug(`[Logos] Cached error for domain: ${domain} - ${cachedMetadata.error}`);
      return null;
    }
    if (cachedMetadata.s3Key) {
      // 2. If metadata exists, check ImageMemoryManager for buffer
      const cachedImage = await imageMemoryManager.get(cachedMetadata.s3Key);
      if (cachedImage?.buffer) {
        logger.debug(`[Logos] Using cached logo from ImageMemoryManager for domain: ${domain}`);
        return { ...cachedMetadata, buffer: cachedImage.buffer, retrieval: "mem-cache" };
      }
    }
  }

  // 3. Check S3 store if not in memory
  const s3Result = await readLogoFromS3(domain);
  if (s3Result?.s3Key) {
    serverCache.setLogoFetch(domain, s3Result);
    return s3Result;
  }

  // 4. Fetch from external source if not in cache or S3
  try {
    const fetchResult = await fetchFunction(domain);
    // The fetch function now handles caching, so we just return the result
    if (fetchResult) {
      return fetchResult;
    }

    logger.warn(`[Logos] Fetch returned no valid logo for domain: ${domain}`);
    // Cache the failure with TTL
    serverCache.setLogoFetch(domain, {
      error: "No valid logo found",
      source: null,
      url: null,
      retrieval: "external",
      contentType: "",
    });
    return null;
  } catch (error) {
    logger.error(`[Logos] Error fetching logo for domain: ${domain}:`, error);
    // Cache the error with TTL
    serverCache.setLogoFetch(domain, {
      error: error instanceof Error ? error.message : "Fetch error",
      source: null,
      url: null,
      retrieval: "external",
      contentType: "",
    });
    return null;
  }
}

/**
 * Gets a logo for a domain with retry logic and placeholder fallback.
 * This function integrates retries and placeholder logic for consistent failures.
 * @param domain - The domain for which to get the logo.
 * @param fetchFunction - The function to call for fetching the logo.
 * @param maxRetries - Maximum number of retries before falling back to placeholder (default: 3).
 * @returns Promise resolving to a LogoResult if successful, null if all attempts fail.
 */
export async function getLogoWithRetryAndPlaceholder(
  domain: string,
  fetchFunction: (domain: string) => Promise<LogoResult | null>,
  maxRetries = 3,
): Promise<LogoResult | null> {
  let retries = 0;
  while (retries < maxRetries) {
    const result = await getLogoWithCache(domain, fetchFunction);
    if (result?.s3Key) {
      // Buffer is now managed by ImageMemoryManager, so we just return the metadata
      return result;
    }
    retries++;
    if (retries === maxRetries) {
      logger.warn(`[Logos] All ${maxRetries} attempts failed for domain: ${domain}. Writing placeholder logo.`);
      const placeholderWritten = await writePlaceholderLogo(domain);
      if (placeholderWritten) {
        // After writing, we can attempt one final read from cache/S3
        return getLogoWithCache(domain, () => Promise.resolve(null));
      }
      logger.error(`[Logos] Failed to write placeholder logo for domain: ${domain}. No logo available.`);
      return null;
    }
    // Exponential backoff with cap at 30 seconds
    const backoff = Math.min(2 ** retries * 1000, 30000);
    logger.debug(`[Logos] Retrying logo fetch for ${domain} after ${backoff}ms delay...`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  return null;
}

export async function getLogo(domain: string): Promise<LogoResult | null> {
  const imageMemoryManager = ImageMemoryManagerInstance;
  const serverCache = ServerCacheInstance;

  return getLogoWithRetryAndPlaceholder(
    domain,
    async (d: string): Promise<LogoResult | null> => {
      const external = await fetchExternalLogo(d);
      if (!external || !external.buffer) return null;

      const contentType = determineContentType(external.buffer);
      const ext = contentType === "image/svg+xml" ? "svg" : "png";
      const s3Key = getLogoS3Key(d, external.source, ext);

      // Write to S3
      await writeLogoToS3(d, external.buffer, external.source, contentType);

      // Set in memory manager
      imageMemoryManager.set(s3Key, external.buffer, {
        contentType,
        source: external.source as ImageSource,
      });

      const cdnUrl = process.env.NEXT_PUBLIC_S3_CDN_URL ? `${process.env.NEXT_PUBLIC_S3_CDN_URL}/${s3Key}` : undefined;
      const result: LogoResult = {
        s3Key,
        source: external.source,
        retrieval: "external",
        url: cdnUrl,
        cdnUrl,
        contentType,
        buffer: external.buffer,
      };

      // Set in server cache
      serverCache.setLogoFetch(d, result);

      return result;
    },
    3,
  );
}

/**
 * Determines the content type of a logo buffer safely without memory retention.
 * Uses buffer.toString() with offset/length instead of buffer.slice() to prevent
 * parent buffer retention that causes memory leaks.
 *
 * @param buffer - The logo buffer to analyze
 * @returns The content type: "image/svg+xml" for SVG, "image/png" otherwise
 */
function determineContentType(buffer: Buffer): string {
  // Check if it's SVG by examining the content
  // CRITICAL: Use toString with offset/length to avoid Buffer.slice() memory retention
  const bufferString = buffer.toString("utf-8", 0, Math.min(1024, buffer.length)).trim();
  if (bufferString.startsWith("<svg") || bufferString.includes("</svg>")) {
    return "image/svg+xml";
  }

  // For all other cases, assume PNG (as external fetch converts to PNG)
  return "image/png";
}
