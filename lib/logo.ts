/**
 * Logo Management Module
 * @module lib/logo
 * @description
 * Provides functionality for fetching, caching, and managing company logos.
 * Includes utilities for URL processing, source detection, and error handling.
 *
 * @example
 * ```typescript
 * // Fetch a logo with automatic caching
 * const logo = await fetchLogo('example.com');
 *
 * // Clear the logo cache
 * clearLogoCache();
 * ```
 */

import { LogoResult, LogoCache, LogoSource } from "../types/logo";
import { ENDPOINTS } from "./constants";
import { timestamp } from "./dateTime";

/**
 * Configuration constants for logo management
 * @internal
 */
const CONFIG = {
  /** Key used for storing logo cache in localStorage */
  CACHE_KEY: "logo-cache",

  /** Cache duration in milliseconds (30 days) */
  CACHE_DURATION: 30 * 24 * 60 * 60 * 1000,

  /** Check if we're running in a browser environment */
  IS_BROWSER: typeof window !== "undefined"
} as const;

/**
 * Custom error class for logo-related errors
 * @class
 */
class LogoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LogoError";
  }
}

/**
 * Loads the logo cache from localStorage
 * @returns {LogoCache} The cached logo data or empty object if no cache exists
 * @throws {LogoError} If there's an error parsing the cache
 * @internal
 *
 * @example
 * ```typescript
 * const cache = loadCache();
 * const logoData = cache['example.com'];
 * ```
 */
function loadCache(): LogoCache {
  if (!CONFIG.IS_BROWSER) return {};

  try {
    const cached = localStorage.getItem(CONFIG.CACHE_KEY);
    if (!cached) return {};

    const parsed = JSON.parse(cached);
    if (typeof parsed !== "object" || parsed === null) {
      throw new LogoError("Invalid cache format");
    }

    return parsed as LogoCache;
  } catch (error) {
    console.warn("Failed to load logo cache:", error);
    return {};
  }
}

/**
 * Saves the logo cache to localStorage
 * @param {LogoCache} cache - The cache data to save
 * @throws {LogoError} If there's an error saving the cache
 * @internal
 *
 * @example
 * ```typescript
 * const cache = loadCache();
 * cache['example.com'] = { url: 'https://...', timestamp: Date.now() };
 * saveCache(cache);
 * ```
 */
function saveCache(cache: LogoCache): void {
  if (!CONFIG.IS_BROWSER) return;

  try {
    localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("Failed to save logo cache:", message);
    throw new LogoError(`Failed to save cache: ${message}`);
  }
}

/**
 * Extracts a domain from a URL or company name
 * @param {string} input - The URL or company name to process
 * @returns {string} The extracted domain or processed company name
 * @throws {LogoError} If the input is empty or invalid
 * @internal
 *
 * @example
 * ```typescript
 * extractDomain('https://www.example.com') // Returns 'example.com'
 * extractDomain('Example Corp') // Returns 'examplecorp'
 * ```
 */
function extractDomain(input: string): string {
  if (!input || typeof input !== "string") {
    throw new LogoError("Invalid input: must be a non-empty string");
  }

  try {
    if (input.includes("://") || input.includes("www.")) {
      const url = new URL(input.includes("://") ? input : `https://${input}`);
      return url.hostname.replace(/^www\./, "");
    }
    return input.toLowerCase().replace(/\s+/g, "");
  } catch (error) {
    // If URL parsing fails, treat as company name
    return input.toLowerCase().replace(/\s+/g, "");
  }
}

/**
 * Determine logo source from URL
 * @param {string} url - The logo URL
 * @returns {LogoSource} The source of the logo
 * @internal
 *
 * @example
 * ```typescript
 * determineSource('https://google.com/logo.png') // Returns 'google'
 * determineSource('https://duckduckgo.com/i/logo.png') // Returns 'duckduckgo'
 * determineSource('https://example.com/logo.png') // Returns null
 * ```
 */
function determineSource(url: string | null): LogoSource {
  if (!url) return null;
  if (typeof url !== "string") return null;

  const urlLower = url.toLowerCase();
  if (urlLower.includes("google.com")) return "google";
  if (urlLower.includes("duckduckgo.com")) return "duckduckgo";
  return null;
}

/**
 * Fetches a logo for a given company/website
 * @param {string} input - The company name or website URL
 * @returns {Promise<LogoResult>} The logo result containing URL and metadata
 * @throws {LogoError} If the input is invalid or the fetch fails
 *
 * @example
 * ```typescript
 * // Fetch by domain
 * const result1 = await fetchLogo('example.com');
 *
 * // Fetch by company name
 * const result2 = await fetchLogo('Example Corp');
 *
 * // Handle errors
 * try {
 *   const result = await fetchLogo('example.com');
 *   if (result.error) {
 *     console.error('Logo fetch failed:', result.error);
 *   }
 * } catch (error) {
 *   console.error('Fatal error:', error);
 * }
 * ```
 */
export async function fetchLogo(input: string): Promise<LogoResult> {
  // Check client cache first
  const cache: LogoCache = loadCache();
  const domain = extractDomain(input);
  const cached = cache[domain];

  if (cached && timestamp() - cached.timestamp < CONFIG.CACHE_DURATION) {
    if (cached.url === null) {
      return {
        url: null,
        source: null,
        error: cached.error || "No valid logo found (cached)"
      };
    }
    return {
      url: cached.url,
      source: determineSource(cached.url),
      inversion: cached.inversion
    };
  }

  try {
    if (!input) {
      throw new LogoError("Input is required");
    }

    // Build query params
    const params = new URLSearchParams();
    if (input.includes("://") || input.includes("www.")) {
      params.set("website", input);
    } else {
      params.set("company", input);
    }

    // Fetch from server API
    const response = await fetch(`${ENDPOINTS.logo}?${params.toString()}`);
    if (!response.ok) {
      throw new LogoError(`Failed to fetch logo: ${response.statusText}`);
    }

    let result;
    try {
      result = await response.json();
    } catch (error) {
      throw new LogoError("Invalid response format");
    }

    // If the result has an error, preserve it
    if (result.error) {
      const errorResult = {
        url: null,
        source: null,
        error: result.error
      };

      // Cache the error
      cache[domain] = {
        ...errorResult,
        timestamp: timestamp()
      };
      saveCache(cache);

      return errorResult;
    }

    // Validate response format
    if (!result.url) {
      throw new LogoError("Invalid response: missing URL");
    }

    // Cache the successful result
    // Use source from API response if provided, otherwise determine from URL
    const source = result.source || determineSource(result.url);
    const successResult = {
      url: result.url,
      source,
      inversion: result.inversion
    };

    cache[domain] = {
      ...successResult,
      timestamp: timestamp()
    };
    saveCache(cache);

    return successResult;
  } catch (error) {
    const errorMessage = error instanceof LogoError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Failed to fetch logo";

    console.error("Error fetching logo:", errorMessage);

    const errorResult = {
      url: null,
      source: null,
      error: errorMessage
    };

    // Cache the failure
    cache[domain] = {
      ...errorResult,
      timestamp: timestamp()
    };
    saveCache(cache);

    return errorResult;
  }
}

/**
 * Clears the logo cache from localStorage
 * @throws {LogoError} If there's an error clearing the cache
 *
 * @example
 * ```typescript
 * try {
 *   clearLogoCache();
 *   console.log('Cache cleared successfully');
 * } catch (error) {
 *   console.error('Failed to clear cache:', error);
 * }
 * ```
 */
export function clearLogoCache(): void {
  if (!CONFIG.IS_BROWSER) return;

  try {
    localStorage.removeItem(CONFIG.CACHE_KEY);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn("Failed to clear logo cache:", message);
    throw new LogoError(`Failed to clear cache: ${message}`);
  }
}
