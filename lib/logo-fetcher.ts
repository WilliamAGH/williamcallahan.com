/**
 * Logo Fetching Utility
 * @module lib/logo-fetcher
 * @description
 * Direct logo fetching implementation that works during build time
 * and runtime. This module provides the core logo fetching logic
 * used by both API routes and server components.
 */

import { ServerCache } from './server-cache';
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
  const cached = ServerCache.getLogoFetch(domain);
  if (cached?.buffer) {
    return {
      buffer: cached.buffer,
      source: cached.source
    };
  }

  // Try each source directly
  for (const source of ['google', 'clearbit', 'duckduckgo'] as const) {
    try {
      const url = LOGO_SOURCES[source].hd(domain);
      const response = await fetch(url, {
        next: { revalidate: 3600 } // Cache for 1 hour
      });

      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());

        // Cache the result
        ServerCache.setLogoFetch(domain, {
          url: null,
          source,
          buffer
        });

        return { buffer, source };
      }
    } catch (error) {
      console.error(`Error fetching from ${source}:`, error);
    }
  }

  // Cache the failure
  ServerCache.setLogoFetch(domain, {
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
