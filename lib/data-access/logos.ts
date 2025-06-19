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
import { writeBinaryS3 } from "@/lib/s3-utils";
import { ServerCacheInstance } from "@/lib/server-cache";
import logger from "@/lib/utils/logger";
import type { LogoResult, LogoSource } from "@/types/logo";

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
      buffer: placeholderBuffer,
      source: "unknown",
      url: null,
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
      return {
        buffer: result.buffer,
        source: result.source,
        url: null,
        retrieval: "s3-store",
        contentType: result.key.endsWith(".svg") ? "image/svg+xml" : "image/png",
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
 * @returns Promise resolving to true if successful, false otherwise.
 */
export async function writeLogoToS3(
  domain: string,
  buffer: Buffer,
  source: LogoSource,
  contentType: string,
): Promise<boolean> {
  if (!process.env.S3_BUCKET) {
    logger.error("[Logos] S3_BUCKET environment variable not set. Cannot write logo.");
    return false;
  }

  if (!source) {
    logger.error(`[Logos] Cannot write logo without source information for domain: ${domain}`);
    return false;
  }

  const ext = contentType === "image/svg+xml" ? "svg" : "png";
  const s3Key = getLogoS3Key(domain, source, ext);
  try {
    await writeBinaryS3(s3Key, buffer, contentType);
    logger.info(`[Logos] Successfully wrote logo to S3 for domain: ${domain} from source: ${source} at key: ${s3Key}`);
    return true;
  } catch (error) {
    logger.error(`[Logos] Failed to write logo to S3 for domain: ${domain} at key: ${s3Key}:`, error);
    return false;
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
  // Check ServerCacheInstance (memory cache with TTL)
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached) {
    if (cached.error) {
      logger.debug(`[Logos] Cached error for domain: ${domain} - ${cached.error}`);
      return null;
    }
    if (cached.buffer) {
      logger.debug(`[Logos] Using cached logo result for domain: ${domain}`);
      return {
        buffer: cached.buffer,
        source: cached.source || "unknown",
        url: null,
        retrieval: "mem-cache",
        contentType: cached.buffer[0] === 0x3c ? "image/svg+xml" : "image/png",
      };
    }
  }

  // Check S3 store
  const s3Result = await readLogoFromS3(domain);
  if (s3Result) {
    // Cache the S3 result
    ServerCacheInstance.setLogoFetch(domain, {
      buffer: s3Result.buffer,
      source: s3Result.source,
      url: null,
    });
    return s3Result;
  }

  // Fetch from external source if not in cache or S3
  try {
    const fetchResult = await fetchFunction(domain);
    if (fetchResult && Buffer.isBuffer(fetchResult.buffer) && fetchResult.buffer.length > 0) {
      // Write to S3 for persistence with source information
      if (fetchResult.source && fetchResult.contentType) {
        await writeLogoToS3(domain, fetchResult.buffer, fetchResult.source, fetchResult.contentType);
      }
      // Cache the successful result
      ServerCacheInstance.setLogoFetch(domain, {
        buffer: fetchResult.buffer,
        source: fetchResult.source,
        url: null,
      });
      return fetchResult;
    }
    logger.warn(`[Logos] Fetch returned no valid logo for domain: ${domain}`);
    // Cache the failure with TTL
    ServerCacheInstance.setLogoFetch(domain, {
      error: "No valid logo found",
      source: null,
      url: null,
    });
    return null;
  } catch (error) {
    logger.error(`[Logos] Error fetching logo for domain: ${domain}:`, error);
    // Cache the error with TTL
    ServerCacheInstance.setLogoFetch(domain, {
      error: error instanceof Error ? error.message : "Fetch error",
      source: null,
      url: null,
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
    if (result && Buffer.isBuffer(result.buffer) && result.buffer.length > 0) {
      return result;
    }
    retries++;
    if (retries === maxRetries) {
      logger.warn(`[Logos] All ${maxRetries} attempts failed for domain: ${domain}. Writing placeholder logo.`);
      const placeholderWritten = await writePlaceholderLogo(domain);
      if (placeholderWritten) {
        const placeholderBuffer = await getPlaceholderLogoBuffer();
        if (placeholderBuffer) {
          return {
            buffer: placeholderBuffer,
            retrieval: "s3-store",
            source: "unknown",
            url: null,
            contentType: "image/svg+xml",
          };
        }
      }
      logger.error(`[Logos] Failed to write placeholder logo for domain: ${domain}. No logo available.`);
      return null;
    }
    // Exponential backoff with cap at 30 seconds
    const backoff = Math.min(2 ** retries * 1000, 30000);
    logger.debug(`[Logos] Retrying logo fetch for ${domain} after ${backoff}ms delay...`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
  return null; // This line should never be reached due to the placeholder logic above
}

export async function getLogo(domain: string): Promise<LogoResult | null> {
  // Standard public helper used by data-access consumers and scripts
  return getLogoWithRetryAndPlaceholder(
    domain,
    async (d: string): Promise<LogoResult | null> => {
      const external = await fetchExternalLogo(d);
      if (!external) return null;

      // The processImageBuffer in external-fetch already determines if it's SVG or PNG
      // But it doesn't return the contentType. For now, we know it converts everything
      // to PNG unless it's already SVG
      const contentType = determineContentType(external.buffer);

      return {
        buffer: external.buffer,
        source: external.source,
        retrieval: "external",
        url: null,
        contentType,
      };
    },
    3,
  );
}

/**
 * Determines the content type of a logo buffer.
 * @param buffer - The logo buffer to analyze.
 * @returns The content type of the buffer.
 */
function determineContentType(buffer: Buffer): string {
  // Check if it's SVG by examining the content
  const bufferString = buffer.slice(0, 1024).toString("utf-8").trim();
  if (bufferString.startsWith("<svg") || bufferString.includes("</svg>")) {
    return "image/svg+xml";
  }

  // For all other cases, assume PNG (as external fetch converts to PNG)
  return "image/png";
}
