/**
 * Build-time logo fetcher - handles logo fetching during SSG/build phase
 *
 * Features: Direct data access during build, API fallback at runtime
 * Note: Being phased out - use @/lib/logo.server instead
 *
 * @module lib/logo-fetcher
 */

import type { LogoResult, LogoSource } from "@/types";
import type { ImageSource } from "@/types/image";
import { getLogo as getLogoFromDataAccess } from "./data-access"; // Import direct data access function
import { ImageMemoryManagerInstance } from "./image-memory-manager";

import { getBaseUrl } from "./utils/get-base-url";
import { isDebug } from "./utils/debug";
import { normalizeDomain } from "./utils/domain-utils";
import { assertServerOnly } from "./utils/ensure-server-only";

// Detect if we're in a build environment
const IS_BUILD_PHASE =
  process.env.NEXT_PHASE === "phase-production-build" || process.env.NEXT_PUBLIC_USE_DIRECT_DATA_ACCESS === "true";
// FS imports no longer needed here
// import fs from 'node:fs/promises';
// import path from 'node:path';
// import { createHash } from 'node:crypto';

assertServerOnly();

// --- All Filesystem Helper Functions (fsGetDomainHash, fsGetLogoPath, fsReadLogoFromDisk, fsWriteLogoToDisk, fsEnsureLogosDirectory) are REMOVED ---
// --- The filesystemReadyPromise is REMOVED ---

// --- Constants ---
// const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build'; // May not be needed directly
// const FETCH_TIMEOUT_MS = IS_BUILD_PHASE ? 2000 : 5000; // API route will handle its own timeouts

/**
 * Fetch a logo for a given domain.
 * 1. Checks memory cache.
 * 2. If not in memory, calls the /api/logo endpoint to fetch/retrieve the logo.
 *    The API endpoint handles external fetching, validation, disk caching, and serving.
 * @param {string} domain - Domain to fetch logo for
 * @returns {Promise<LogoResult | null>}
 */
export async function fetchLogo(domain: string): Promise<LogoResult | null> {
  if (!domain) {
    console.warn("[logo-fetcher] fetchLogo called with empty domain.");
    return null;
  }

  const normalizedDomain = normalizeDomain(domain); // Ensure consistent domain format for caching/requests

  // Memory cache is now handled inside getLogo() from data access layer
  // No need to check ServerCacheInstance here

  // During build phase, use direct data access instead of API calls
  if (IS_BUILD_PHASE) {
    if (isDebug)
      console.debug(`[logo-fetcher] Build phase detected, using direct data access for logo: ${normalizedDomain}`);
    try {
      // Use empty string as baseUrl to signal "no network validation"
      // or use API_BASE_URL which is guaranteed to exist in the build context
      const logoResult = await getLogoFromDataAccess(normalizedDomain);

      if (logoResult?.s3Key) {
        if (isDebug)
          console.debug(
            `[logo-fetcher] Retrieved logo for ${normalizedDomain} (source: ${logoResult.source || "unknown"}) from data access layer`,
          );
        return logoResult;
      }

      const error = `Failed to retrieve logo for ${normalizedDomain} via direct data access`;
      console.warn(`[logo-fetcher] ${error}`);
      return null;
    } catch (error) {
      const errorObj = error as Error;
      const errorMessage = `[logo-fetcher] Error accessing logo for ${normalizedDomain} via direct data access: ${errorObj.message}`;
      console.error(errorMessage, error);
      return null;
    }
  }

  // 2. Fetch from /api/logo endpoint (normal runtime behavior)
  if (isDebug) console.debug(`[logo-fetcher] Cache miss (Memory): ${normalizedDomain}. Calling /api/logo endpoint...`);
  try {
    // Construct the URL for the API endpoint.
    const baseUrl = getBaseUrl(); // Added
    const apiUrl = `${baseUrl}/api/logo?website=${encodeURIComponent(normalizedDomain)}`; // Modified

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_000); // 7 s hard-stop

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Accept: "image/png, image/svg+xml, */*", // Accept expected logo types
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (response.ok) {
      // The API returns the image buffer directly. We need to reconstruct the LogoResult.
      // This is a transitional state; ideally the API would return JSON metadata.
      const s3Key = response.headers.get("x-logo-s3-key"); // Assuming API returns this
      const source = response.headers.get("x-logo-source") as LogoSource;
      const contentType = response.headers.get("content-type");

      if (s3Key && contentType) {
        const buffer = Buffer.from(await response.arrayBuffer());
        // Also cache it in the local memory manager
        ImageMemoryManagerInstance.set(s3Key, buffer, { contentType, source: source as ImageSource });
        return {
          s3Key,
          source,
          contentType,
          retrieval: "api",
        };
      }
    }

    const errorText = await response.text().catch(() => `Status ${response.status}`);
    const logoErrorHeader = response.headers.get("x-logo-error");
    const apiError =
      logoErrorHeader || `API request to /api/logo failed for ${normalizedDomain}: ${errorText.substring(0, 100)}`;
    console.warn(`[logo-fetcher] ${apiError}`);
    return null;
  } catch (error) {
    const errorObj = error as Error;
    const errorMessage = `[logo-fetcher] Network error calling /api/logo for ${normalizedDomain}: ${errorObj.message}`;
    console.error(errorMessage, error);
    return null;
  }
}

export { normalizeDomain } from "./utils/domain-utils";
