import { LogoResult, LogoCache, LogoSource } from '../types/logo';
import { ENDPOINTS } from './constants';

/** Key used for storing logo cache in localStorage */
const CACHE_KEY = 'logo-cache';

/** Cache duration in milliseconds (30 days) */
const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000;

/** Check if we're running in a browser environment */
const isBrowser = typeof window !== 'undefined';

/**
 * Loads the logo cache from localStorage
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
 * @param {LogoCache} cache - The cache data to save
 */
function saveCache(cache: LogoCache): void {
  if (!isBrowser) return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to save logo cache:', error);
  }
}

/**
 * Extracts a domain from a URL or company name
 * @param {string} input - The URL or company name to process
 * @returns {string} The extracted domain or processed company name
 */
function extractDomain(input: string): string {
  try {
    if (input.includes('://') || input.includes('www.')) {
      const url = new URL(input.includes('://') ? input : `https://${input}`);
      return url.hostname.replace('www.', '');
    }
    return input.toLowerCase().replace(/\s+/g, '');
  } catch {
    return input.toLowerCase().replace(/\s+/g, '');
  }
}

/**
 * Determine logo source from URL
 * @param {string} url - The logo URL
 * @returns {LogoSource} The source of the logo
 */
function determineSource(url: string): LogoSource {
  if (!url) return null;
  if (url.includes('google.com')) return 'google';
  if (url.includes('duckduckgo.com')) return 'duckduckgo';
  return null;
}

/**
 * Fetches a logo for a given company/website
 * @param {string} input - The company name or website URL
 * @returns {Promise<LogoResult>} The logo result containing URL and metadata
 */
export async function fetchLogo(input: string): Promise<LogoResult> {
  // Check client cache first
  const cache: LogoCache = loadCache();
  const domain = extractDomain(input);
  const cached = cache[domain];

  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    if (cached.url === null) {
      return {
        url: null,
        source: null,
        error: cached.error || 'No valid logo found (cached)'
      };
    }
    return {
      url: cached.url,
      source: determineSource(cached.url),
      inversion: cached.inversion
    };
  }

  try {
    // Build query params
    const params = new URLSearchParams();
    if (input.includes('://') || input.includes('www.')) {
      params.set('website', input);
    } else {
      params.set('company', input);
    }

    // Fetch from server API
    const response = await fetch(`${ENDPOINTS.logo}?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch logo');
    }

    const result = await response.json();

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
        timestamp: Date.now()
      };
      saveCache(cache);

      return errorResult;
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
      timestamp: Date.now()
    };
    saveCache(cache);

    return successResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch logo';
    console.error('Error fetching logo:', errorMessage);

    const errorResult = {
      url: null,
      source: null,
      error: errorMessage
    };

    // Cache the failure
    cache[domain] = {
      ...errorResult,
      timestamp: Date.now()
    };
    saveCache(cache);

    return errorResult;
  }
}

/**
 * Clears the logo cache from localStorage
 */
export function clearLogoCache(): void {
  if (!isBrowser) return;

  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (error) {
    console.warn('Failed to clear logo cache:', error);
  }
}
