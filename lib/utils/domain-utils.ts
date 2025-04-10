/**
 * Domain Utilities
 * @module lib/utils/domain-utils
 * @description Utility functions for handling domains and URLs.
 */

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