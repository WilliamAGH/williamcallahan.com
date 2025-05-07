/**
 * Logo Fetching Utility
 * @module lib/logo-fetcher
 * @description
 * Direct logo fetching implementation that works during build time
 * and runtime. This module provides the core logo fetching logic
 * used by both API routes and server components.
 */

import { ServerCacheInstance } from './server-cache';
// import { LOGO_SOURCES } from './constants'; // No longer directly used for fetching here
import type { LogoSource } from '../types/logo'; // Still used for typing the return
import { assertServerOnly } from './utils/ensure-server-only';
import { getBaseUrl } from './getBaseUrl'; // Added import
import { getLogo as getLogoFromDataAccess } from './data-access'; // Import direct data access function

// Detect if we're in a build environment
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build' ||
                       process.env.NEXT_PUBLIC_USE_DIRECT_DATA_ACCESS === 'true';
// FS imports no longer needed here
// import fs from 'node:fs/promises';
// import path from 'node:path';
// import { createHash } from 'node:crypto';

assertServerOnly('lib/logo-fetcher.ts');

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
    return { buffer: null, source: null, error: 'Domain is required' };
  }

  const normalizedDomain = normalizeDomain(domain); // Ensure consistent domain format for caching/requests

  // 1. Check Memory Cache
  const memoryCached = ServerCacheInstance.getLogoFetch(normalizedDomain);
  if (memoryCached) {
    if (memoryCached.buffer) {
      console.debug(`[logo-fetcher] Cache hit (Memory): ${normalizedDomain} from ${memoryCached.source || 'unknown'}`);
      return { buffer: memoryCached.buffer, source: memoryCached.source };
    }
    // If there's a cached error, respect it for a short duration or specific conditions,
    // but generally, allow the API route to re-evaluate.
    // For simplicity here, if there's no buffer, we'll try the API.
    // More sophisticated error caching could be added if needed.
    if (memoryCached.error) {
        console.debug(`[logo-fetcher] Memory cache contains error for ${normalizedDomain}: ${memoryCached.error}. Will try API route.`);
    }
  }

  // During build phase, use direct data access instead of API calls
  if (IS_BUILD_PHASE) {
    console.debug(`[logo-fetcher] Build phase detected, using direct data access for logo: ${normalizedDomain}`);
    try {
      // Use empty string as baseUrl to signal "no network validation"
      // or use API_BASE_URL which is guaranteed to exist in the build context
      const logoResult = await getLogoFromDataAccess(
        normalizedDomain,
        process.env.API_BASE_URL || '',
      );

      if (logoResult && logoResult.buffer) {
        console.debug(`[logo-fetcher] Successfully retrieved logo for ${normalizedDomain} via direct data access (source: ${logoResult.source || 'unknown'})`);
        // Cache in memory
        ServerCacheInstance.setLogoFetch(normalizedDomain, { url: null, source: logoResult.source, buffer: logoResult.buffer });
        return { buffer: logoResult.buffer, source: logoResult.source };
      } else {
        const error = `Failed to retrieve logo for ${normalizedDomain} via direct data access`;
        console.warn(`[logo-fetcher] ${error}`);
        return { buffer: null, source: null, error };
      }
    } catch (error: any) {
      const errorMessage = `[logo-fetcher] Error accessing logo for ${normalizedDomain} via direct data access: ${error.message}`;
      console.error(errorMessage, error);
      return { buffer: null, source: null, error: error.message };
    }
  }

  // 2. Fetch from /api/logo endpoint (normal runtime behavior)
  console.debug(`[logo-fetcher] Cache miss (Memory): ${normalizedDomain}. Calling /api/logo endpoint...`);
  try {
    // Construct the URL for the API endpoint.
    const baseUrl = getBaseUrl(); // Added
    const apiUrl = `${baseUrl}/api/logo?website=${encodeURIComponent(normalizedDomain)}`; // Modified

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7_000); // 7 s hard-stop

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'image/png, image/svg+xml, */*', // Accept expected logo types
      },
      signal: controller.signal,
      // next: { revalidate: 60 } // Client-side fetch revalidation, API route controls its own revalidation
      // cache: 'no-store' // Let the browser and Next.js handle caching based on API response headers
    });
    clearTimeout(timer);

    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      const logoSource = response.headers.get('x-logo-source') as LogoSource | null;

      if (buffer && buffer.byteLength > 0) {
        console.debug(`[logo-fetcher] Successfully fetched logo for ${normalizedDomain} from /api/logo (source: ${logoSource || 'unknown'})`);
        // Cache in memory
        ServerCacheInstance.setLogoFetch(normalizedDomain, { url: null, source: logoSource, buffer });
        return { buffer, source: logoSource };
      } else {
        const error = `Empty response buffer from /api/logo for ${normalizedDomain}`;
        console.warn(`[logo-fetcher] ${error}`);
        // Don't cache this specific error type in memory fetcher, let API re-evaluate.
        return { buffer: null, source: null, error };
      }
    } else {
      const errorText = await response.text().catch(() => `Status ${response.status}`);
      const logoErrorHeader = response.headers.get('x-logo-error');
      const error = logoErrorHeader || `API request to /api/logo failed for ${normalizedDomain}: ${errorText.substring(0, 100)}`;
      console.warn(`[logo-fetcher] ${error}`);
      // Cache the error from the API to prevent retrying too frequently for known issues.
      ServerCacheInstance.setLogoFetch(normalizedDomain, { url: null, source: null, error });
      return { buffer: null, source: null, error };
    }
  } catch (error: any) {
    const errorMessage = `[logo-fetcher] Network error calling /api/logo for ${normalizedDomain}: ${error.message}`;
    console.error(errorMessage, error);
    // Don't cache general network errors here as they might be transient.
    return { buffer: null, source: null, error: error.message };
  }
}

/**
 * Extract domain from URL or company name
 * @param {string} input - URL or company name
 * @returns {string} Normalized domain or company name
 */
export function normalizeDomain(input: string): string {
  try {
    // If it's a URL, extract the domain
    if (input.includes('://') || input.startsWith('www.')) {
      const url = input.startsWith('http') ? input : `https://${input}`;
      return new URL(url).hostname.replace('www.', '');
    }
    // Otherwise, treat as company name
    return input.toLowerCase().replace(/\s+/g, '');
  } catch {
    // If URL parsing fails, normalize as company name
    return input.toLowerCase().replace(/\s+/g, '');
  }
}
