/**
 * Application Constants
 * @module lib/constants
 * @description
 * Central location for all application constants.
 * These values are used across the application to maintain consistency
 * and make configuration changes easier.
 */

/**
 * Cache duration for client-side storage (localStorage)
 * @constant
 * @type {number}
 * @default 30 days in milliseconds
 */
export const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000;

/**
 * Cache duration for server-side storage (NodeCache)
 * @constant
 * @type {number}
 * @default 30 days in seconds
 */
export const SERVER_CACHE_DURATION = 30 * 24 * 60 * 60;

/**
 * Base URL for API endpoints
 * @constant
 * @type {string}
 * @remarks
 * In production, this defaults to the main domain.
 * In development, it uses localhost.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : 'https://williamcallahan.com'
);

/**
 * API endpoints for the application
 * @constant
 * @type {Object}
 * @property {string} validateLogo - Endpoint for logo validation
 * @property {string} logo - Endpoint for logo fetching
 */
export const ENDPOINTS = {
  validateLogo: `${API_BASE_URL}/api/validate-logo`,
  logo: `${API_BASE_URL}/api/logo`
} as const;

/**
 * Logo source URLs
 * @constant
 * @type {Object}
 * @property {Function} google - Functions to generate Google favicon URLs
 * @property {Function} clearbit - Functions to generate Clearbit logo URLs
 * @property {Function} duckduckgo - Functions to generate DuckDuckGo favicon URLs
 */
export const LOGO_SOURCES = {
  google: {
    hd: (domain: string) =>
      `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
    md: (domain: string) =>
      `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    sm: (domain: string) =>
      `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  },
  clearbit: {
    hd: (domain: string) =>
      `https://logo.clearbit.com/${domain}?size=256&format=png`,
    md: (domain: string) =>
      `https://logo.clearbit.com/${domain}?size=128&format=png`
  },
  duckduckgo: {
    hd: (domain: string) =>
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    md: (domain: string) =>
      `https://external-content.duckduckgo.com/ip3/${domain}.ico`
  }
} as const;

/**
 * Regular expressions to identify generic globe icons
 * @constant
 * @type {RegExp[]}
 * @remarks
 * These patterns match known URLs that return generic globe icons
 * instead of actual company logos.
 */
export const GENERIC_GLOBE_PATTERNS = [
  // Google patterns
  /\/s2\/favicons\?.*&sz=\d+.*&err=1/i,
  /\/s2\/favicons\?.*&defaulticon=1/i,
  // DuckDuckGo patterns
  /\/ip3\/[^/]+\.ico.*\?v=\d+/i,
  /\/ip3\/[^/]+\.ico\?f=1/i,
  // Clearbit patterns
  /logo\.clearbit\.com\/.*\?.*&default/i
] as const;

/**
 * Valid image formats for logo processing
 * @constant
 * @type {string[]}
 */
export const VALID_IMAGE_FORMATS = ['jpeg', 'png', 'webp', 'gif', 'svg', 'ico'] as const;

/**
 * Minimum size for logo images
 * @constant
 * @type {number}
 * @default 64 pixels
 */
export const MIN_LOGO_SIZE = 64;

/**
 * Desired logo sizes
 * @constant
 * @type {Object}
 */
export const LOGO_SIZES = {
  HD: 256,
  MD: 128,
  SM: 64
} as const;

/**
 * Maximum allowed difference in dimensions for image comparison
 * @constant
 * @type {number}
 * @default 10 pixels
 */
export const MAX_SIZE_DIFF = 10;