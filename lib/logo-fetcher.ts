/**
 * Build-time logo fetcher - handles logo fetching during SSG/build phase
 *
 * Features: Direct data access during build, API fallback at runtime
 * Note: Being phased out - use @/lib/logo.server instead
 *
 * @module lib/logo-fetcher
 */

import type { LogoSource } from "@/types"; // Still used for typing the return
import { getLogo as getLogoFromDataAccess } from "./data-access"; // Import direct data access function
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
 * @returns {Promise<{buffer: Buffer | null, source: LogoSource | null, error?: string}>}
 */
export async function fetchLogo(domain: string): Promise<{
  buffer: Buffer | null;
  source: LogoSource | null; // The API route will set an x-logo-source header
  error?: string;
}> {
  if (!domain) {
    return { buffer: null, source: null, error: "Domain is required" };
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

      if (logoResult?.buffer) {
        if (isDebug)
          console.debug(
            `[logo-fetcher] Retrieved logo for ${normalizedDomain} (source: ${logoResult.source || "unknown"}) from data access layer`,
          );
        // Caching is now handled inside getLogo()
        return { buffer: logoResult.buffer, source: logoResult.source };
      }

      const error = `Failed to retrieve logo for ${normalizedDomain} via direct data access`;
      console.warn(`[logo-fetcher] ${error}`);
      return { buffer: null, source: null, error };
    } catch (error) {
      const errorObj = error as Error;
      const errorMessage = `[logo-fetcher] Error accessing logo for ${normalizedDomain} via direct data access: ${errorObj.message}`;
      console.error(errorMessage, error);
      return { buffer: null, source: null, error: errorObj.message };
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
      // next: { revalidate: 60 } // Client-side fetch revalidation, API route controls its own revalidation
      // cache: 'no-store' // Let the browser and Next.js handle caching based on API response headers
    });
    clearTimeout(timer);

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const logoSource = response.headers.get("x-logo-source") as LogoSource | null;

      if (buffer && buffer.byteLength > 0) {
        if (isDebug)
          console.debug(
            `[logo-fetcher] Successfully fetched logo for ${normalizedDomain} from /api/logo (source: ${logoSource || "unknown"})`,
          );
        // The API route should have already cached this via getLogo()
        return { buffer, source: logoSource };
      }

      const emptyBufferError = `Empty response buffer from /api/logo for ${normalizedDomain}`;
      console.warn(`[logo-fetcher] ${emptyBufferError}`);
      // Don't cache this specific error type in memory fetcher, let API re-evaluate.
      return { buffer: null, source: null, error: emptyBufferError };
    }

    const errorText = await response.text().catch(() => `Status ${response.status}`);
    const logoErrorHeader = response.headers.get("x-logo-error");
    const apiError =
      logoErrorHeader || `API request to /api/logo failed for ${normalizedDomain}: ${errorText.substring(0, 100)}`;
    console.warn(`[logo-fetcher] ${apiError}`);
    // The API route should have already cached the error via getLogo()
    return { buffer: null, source: null, error: apiError };
  } catch (error) {
    const errorObj = error as Error;
    const errorMessage = `[logo-fetcher] Network error calling /api/logo for ${normalizedDomain}: ${errorObj.message}`;
    console.error(errorMessage, error);
    // Don't cache general network errors here as they might be transient.
    return { buffer: null, source: null, error: errorObj.message };
  }
}

export { normalizeDomain } from "./utils/domain-utils";
