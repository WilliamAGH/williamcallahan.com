/**
 * Logo Fetching Utility
 * @module lib/logo-fetcher
 * @description
 * Direct logo fetching implementation that works during build time
 * and runtime. This module provides the core logo fetching logic
 * used by both API routes and server components.
 */

import { ServerCacheInstance } from './server-cache';
import { LOGO_SOURCES } from './constants';
import type { LogoSource } from '../types/logo';

/**
 * Fetch a logo for a given domain
 * @param {string} domain - Domain to fetch logo for
 * @returns {Promise<{buffer: Buffer | null, source: LogoSource | null, error?: string}>}
 */
export async function fetchLogo(domain: string): Promise<{
  buffer: Buffer | null;
  source: LogoSource;
  error?: string;
}> {
  // Check cache first
  const cached = ServerCacheInstance.getLogoFetch(domain);
  if (cached?.buffer) {
    return {
      buffer: cached.buffer,
      source: cached.source
    };
  }

  /**
   * Fetch with timeout wrapper
   * @param {string} url - URL to fetch
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Response | null>} Response or null if timeout
   */
  const fetchWithTimeout = async (url: string, timeout = 5000): Promise<Response | null> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        next: { revalidate: 3600 }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      // Gracefully handle timeout/abort
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`Timeout fetching logo from ${url}`);
        return null;
      }
      throw error;
    }
  };

  // Try each source directly with timeout
  for (const source of ['google', 'clearbit', 'duckduckgo'] as const) {
    try {
      const url = LOGO_SOURCES[source].hd(domain);
      const response = await fetchWithTimeout(url);

      // Skip this source if it timed out
      if (!response) continue;

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());

        // Cache the result
        ServerCacheInstance.setLogoFetch(domain, {
          url: null,
          source,
          buffer
        });

        return { buffer, source };
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error fetching from ${source}:`, errorMessage);
    }
  }

  // Cache the failure
  ServerCacheInstance.setLogoFetch(domain, {
    url: null,
    source: null,
    error: 'Failed to fetch logo'
  });

  return { buffer: null, source: null, error: 'Failed to fetch logo' };
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
