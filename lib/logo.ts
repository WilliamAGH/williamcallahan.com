/**
 * Logo Management Module
 * Provides utilities for fetching and caching company/website logos
 *
 * @module lib/logo
 */

import type { LogoResult, LogoCache } from "../types/logo";

/** Key used for storing logo cache in localStorage */
const CACHE_KEY = "logo-cache";

/** Cache duration in milliseconds (7 days) */
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000;

/** Check if we're running in a browser environment */
const isBrowser = typeof window !== "undefined";

/**
 * Loads the logo cache from localStorage
 * Handles SSR by checking for browser environment
 *
 * @returns {LogoCache} The cached logo data or empty object if no cache exists
 */
function loadCache(): LogoCache {
  if (!isBrowser) return {};

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

/**
 * Saves the logo cache to localStorage
 * Handles SSR by checking for browser environment
 *
 * @param {LogoCache} cache - The cache data to save
 */
function saveCache(cache: LogoCache): void {
  if (!isBrowser) return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn("Failed to save logo cache:", error);
  }
}

/**
 * Extracts a domain from a URL or company name
 * Handles both full URLs and plain text company names
 *
 * @param {string} input - The URL or company name to process
 * @returns {string} The extracted domain or processed company name
 * @example
 * extractDomain("https://www.example.com") // returns "example.com"
 * extractDomain("Example Company") // returns "examplecompany"
 */
function extractDomain(input: string): string {
  try {
    // If it's a URL, parse it
    if (input.includes("://") || input.includes("www.")) {
      const url = new URL(input.includes("://") ? input : `https://${input}`);
      return url.hostname.replace("www.", "");
    }
    // If it's a company name, convert to lowercase and remove spaces
    return input.toLowerCase().replace(/\s+/g, "");
  } catch {
    // If URL parsing fails, treat as company name
    return input.toLowerCase().replace(/\s+/g, "");
  }
}

/**
 * Checks if a URL is valid and accessible
 * Makes a request to verify the URL exists
 *
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} Whether the URL is valid and accessible
 */
async function isValidUrl(url: string): Promise<boolean> {
  if (!isBrowser) return false;

  try {
    // Always use GET with no-cors mode for consistent behavior
    const response = await fetch(url, {
      method: "GET",
      mode: 'no-cors',
      cache: 'no-cache'
    });
    return true; // If we get here without error, assume resource exists
  } catch {
    return false;
  }
}

/**
 * Fetches a logo for a given company/website
 * Uses Google's favicon service as primary source with DuckDuckGo as fallback
 * Implements persistent caching with localStorage
 *
 * @param {string} input - The company name or website URL
 * @returns {Promise<LogoResult>} The logo result containing URL and metadata
 * @example
 * const logo = await fetchLogo("google.com");
 * // Returns: { url: "...", source: "google" }
 */
export async function fetchLogo(input: string): Promise<LogoResult> {
  const domain: string = extractDomain(input);
  const cache: LogoCache = loadCache();

  // Check cache first
  const cached = cache[domain];
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return {
      url: cached.url,
      source: cached.url.includes("google.com") ? "google" : "duckduckgo"
    };
  }

  try {
    // Use Google's favicon service as primary source (more reliable, high quality)
    const googleUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;

    // Update cache
    cache[domain] = {
      url: googleUrl,
      timestamp: Date.now()
    };
    saveCache(cache);

    return {
      url: googleUrl,
      source: "google"
    };

  } catch (error) {
    // Fallback to DuckDuckGo if Google fails
    const ddgUrl = `https://external-content.duckduckgo.com/ip3/${domain}.ico`;
    return {
      url: ddgUrl,
      source: "duckduckgo",
      error: "Primary logo source unavailable, using fallback"
    };
  }
}

/**
 * Clears the logo cache from localStorage
 * Useful for testing or forcing fresh logo fetches
 * Handles SSR by checking for browser environment
 */
export function clearLogoCache(): void {
  if (!isBrowser) return;

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn("Failed to clear logo cache:", error);
  }
}
