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
 * Cache duration for logo fetching
 * @constant
 * @type {Object}
 */
export const LOGO_CACHE_DURATION = {
  /** Success cache duration (30 days in seconds) */
  SUCCESS: 30 * 24 * 60 * 60,
  /** Failed attempt cache duration (1 day in seconds) */
  FAILURE: 24 * 60 * 60
} as const;

/**
 * Base URL for the website
 * @constant
 * @type {string}
 * @remarks
 * In production, this defaults to the main domain.
 * In development, it uses localhost.
 */
export const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://williamcallahan.com';

/**
 * Base URL for API endpoints
 * @constant
 * @type {string}
 * @remarks
 * In production, this defaults to the main domain.
 * In development, it uses localhost.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || NEXT_PUBLIC_SITE_URL;

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
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=256`,
    md: (domain: string) =>
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=128`,
    sm: (domain: string) =>
      `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${domain}&size=64`
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
  /\/faviconV2\?.*&fallback_opts=.*&type=DEFAULT/i,
  /\/faviconV2\?.*&fallback_opts=.*&type=FAVICON.*&err=1/i,
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
