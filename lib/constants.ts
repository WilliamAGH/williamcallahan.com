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
 * Cache duration for server-side storage (LRUCache)
 * @constant
 * @type {number}
 * @default 3 days in seconds
 */
export const SERVER_CACHE_DURATION = 3 * 24 * 60 * 60;

/**
 * Cache duration for logo fetching
 * @constant
 * @type {Object}
 */
export const LOGO_CACHE_DURATION = {
  /** Success cache duration (30 days in seconds) */
  SUCCESS: 30 * 24 * 60 * 60,
  /** Failed attempt cache duration (1 day in seconds) */
  FAILURE: 24 * 60 * 60,
} as const;

/**
 * Type definition for S3 storage paths for bookmarks.
 * Explicitly defines the literal string types for each property.
 */
import type { BookmarksS3Paths } from "@/types/lib";

/**
 * S3 storage paths for bookmarks (environment-aware).
 *
 * Production  → bookmarks/bookmarks.json & bookmarks/refresh-lock.json
 * Development → bookmarks/bookmarks-dev.json & bookmarks/refresh-lock-dev.json
 * Test        → bookmarks/bookmarks-test.json & bookmarks/refresh-lock-test.json
 *
 * This isolates each runtime so dev / tests can never overwrite production data.
 *
 * NOTE: All callers import this constant, so we compute the value once at module
 *       load based on `process.env.NODE_ENV`.
 */
const envSuffix = ((): string => {
  const env = process.env.NODE_ENV;
  if (env === "production" || !env) return ""; // default / prod keeps original name
  if (env === "test") return "-test";
  return "-dev"; // treat everything else as development-like
})();

export const BOOKMARKS_S3_PATHS: BookmarksS3Paths = {
  DIR: "bookmarks",
  FILE: `bookmarks/bookmarks${envSuffix}.json`, // Legacy - full file
  LOCK: `bookmarks/refresh-lock${envSuffix}.json`,
  INDEX: `bookmarks/index${envSuffix}.json`, // Lightweight index
  PAGE_PREFIX: `bookmarks/pages${envSuffix}/page-`, // page-1.json, page-2.json, etc.
} as const;

/**
 * Cache duration for bookmarks fetching
 * @constant
 * @type {Object}
 */
export const BOOKMARKS_CACHE_DURATION = {
  /** Success cache duration (7 days in seconds) */
  SUCCESS: 7 * 24 * 60 * 60,
  /** Failed attempt cache duration (1 hour in seconds) */
  FAILURE: 60 * 60,
  /** Revalidation interval (1 hour in seconds) - how often to check for new data */
  REVALIDATION: 1 * 60 * 60,
} as const;

/**
 * Bookmarks API configuration
 * @constant
 * @type {Object}
 */
export const BOOKMARKS_API_CONFIG = {
  /** Base URL for the bookmarks API */
  API_URL: process.env.BOOKMARKS_API_URL ?? "https://bookmark.iocloudhost.net/api/v1",
  /** List ID for fetching bookmarks */
  LIST_ID: process.env.BOOKMARKS_LIST_ID,
  /** Bearer token for API authentication */
  BEARER_TOKEN: process.env.BOOKMARK_BEARER_TOKEN,
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 10_000,
} as const;

/**
 * Number of bookmarks displayed per page in paginated views
 * @constant
 * @type {number}
 * @default 24
 * @remarks
 * Used in:
 * - /app/sitemap.ts - for generating paginated sitemap entries
 * - /components/features/bookmarks/* - as default itemsPerPage prop
 */
export const BOOKMARKS_PER_PAGE = 24;

/**
 * Cache duration for GitHub activity fetching
 * @constant
 * @type {Object}
 */
export const GITHUB_ACTIVITY_CACHE_DURATION = {
  /** Success cache duration (24 hours in seconds) */
  SUCCESS: 24 * 60 * 60,
  /** Failed attempt or incomplete data cache duration (1 hour in seconds) */
  FAILURE: 60 * 60,
  /** Revalidation interval (6 hours in seconds) - how often to check for new data */
  REVALIDATION: 6 * 60 * 60,
} as const;

/**
 * Cache duration for OpenGraph data fetching
 * @constant
 * @type {Object}
 */
export const OPENGRAPH_CACHE_DURATION = {
  /** Success cache duration (3 days in seconds) */
  SUCCESS: 3 * 24 * 60 * 60,
  /** Failed attempt cache duration (2 hours in seconds) */
  FAILURE: 2 * 60 * 60,
  /** Revalidation interval (30 days in seconds) - how often to consider data stale */
  REVALIDATION: 30 * 24 * 60 * 60,
} as const;

/**
 * Cache durations for search results (in seconds)
 * @constant
 * @type {Object}
 */
export const SEARCH_CACHE_DURATION = {
  /** Success cache duration (15 minutes in seconds) */
  SUCCESS: 15 * 60,
  /** Failed attempt cache duration (1 minute in seconds) */
  FAILURE: 60,
  /** Revalidation interval (10 minutes in seconds) - how often to consider data stale */
  REVALIDATION: 10 * 60,
} as const;

/**
 * Configuration for OpenGraph fetching operations
 * @constant
 * @type {Object}
 */
export const OPENGRAPH_FETCH_CONFIG = {
  /** Request timeout in milliseconds */
  TIMEOUT: 30000,
  /** Maximum number of retry attempts */
  MAX_RETRIES: 3,
  /** Base delay for exponential backoff in milliseconds */
  BACKOFF_BASE: 1000,
  /** Maximum delay between retries in milliseconds */
  MAX_BACKOFF: 30000,
  /** Maximum concurrent OpenGraph requests - reduced to prevent memory leaks */
  MAX_CONCURRENT: 3,
} as const;

/**
 * Base URL for the website
 * @constant
 * @type {string}
 * @remarks
 * In production, this defaults to the main domain.
 * In development, it uses localhost.
 */
export const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com";

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
  logo: `${API_BASE_URL}/api/logo`,
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
    // Updated to use the www.google.com/s2/favicons endpoint
    hd: (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=256`,
    md: (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    sm: (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
  },
  clearbit: {
    hd: (domain: string) => `https://logo.clearbit.com/${domain}?size=256&format=png`,
    md: (domain: string) => `https://logo.clearbit.com/${domain}?size=128&format=png`,
  },
  duckduckgo: {
    hd: (domain: string) => `https://icons.duckduckgo.com/ip3/${domain}.ico`,
    md: (domain: string) => `https://external-content.duckduckgo.com/ip3/${domain}.ico`,
  },
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
  /logo\.clearbit\.com\/.*\?.*&default/i,
] as const;

/**
 * Valid image formats for logo processing
 * @constant
 * @type {string[]}
 */
export const VALID_IMAGE_FORMATS = ["jpeg", "png", "webp", "gif", "svg", "ico"] as const;

/**
 * Minimum size for logo images
 * @constant
 * @type {number}
 * @default 64 pixels
 */
export const MIN_LOGO_SIZE = 64;

/**
 * Standard Tailwind CSS breakpoints
 * @constant
 * @type {Object}
 * @remarks
 * Values correspond to the 'min-width' for each breakpoint.
 * Used for JavaScript calculations based on screen size.
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

/**
 * Desired logo sizes
 * @constant
 * @type {Object}
 */
export const LOGO_SIZES = {
  HD: 256,
  MD: 128,
  SM: 64,
} as const;

/**
 * Maximum allowed difference in dimensions for image comparison
 * @constant
 * @type {number}
 * @default 10 pixels
 */
export const MAX_SIZE_DIFF = 10;

/**
 * Key for storing the theme timestamp in localStorage
 * @constant
 * @type {string}
 */
export const THEME_TIMESTAMP_KEY = "theme-timestamp";

/**
 * Hardcoded domains for logo fetching that should always be included
 * @constant
 * @type {readonly string[]}
 * @remarks
 * These represent key institutional and service domains used across the application.
 * Centralized here to avoid duplication across scripts (update-s3-data.ts, prefetch-data.ts, populate-volumes.ts).
 * Many of these domains are also extracted programmatically from education.ts and experience.ts data files.
 */
export const KNOWN_DOMAINS = [
  "creighton.edu",
  "unomaha.edu",
  "stanford.edu",
  "columbia.edu",
  "gsb.columbia.edu",
  "cfp.net",
  "seekinvest.com",
  "tsbank.com",
  "mutualfirst.com",
  "morningstar.com",
] as const;

/**
 * Content Security Policy (CSP) directives for middleware
 * Used by the server to build the Content-Security-Policy header dynamically.
 * Keys are directive names in camelCase, values are arrays of allowed source patterns.
 * Keep entries minimal to avoid oversized headers; do not import Node-only modules here.
 */
export const CSP_DIRECTIVES = {
  defaultSrc: ["'self'"],
  scriptSrc: [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    "https://scripts.simpleanalyticscdn.com",
    "https://static.getclicky.com",
    "https://in.getclicky.com",
    "https://platform.twitter.com",
    "https://*.x.com",
    "blob:",
  ],
  connectSrc: [
    "'self'",
    "https://umami.iocloudhost.net",
    "https://plausible.iocloudhost.net",
    "https://static.cloudflareinsights.com",
    "https://*.sentry.io",
    "https://*.ingest.sentry.io",
    "https://queue.simpleanalyticscdn.com",
    "https://in.getclicky.com",
    "https://react-tweet.vercel.app",
    "https://*.twitter.com",
    "https://twitter.com",
    "https://platform.twitter.com",
    "https://*.x.com",
  ],
  workerSrc: ["'self'", "blob:"],
  imgSrc: [
    "'self'",
    "data:",
    "https://pbs.twimg.com",
    "https://*.twimg.com",
    "https://react-tweet.vercel.app",
    "https:",
  ],
  styleSrc: ["'self'", "'unsafe-inline'", "https://platform.twitter.com", "https://*.twimg.com", "https://*.x.com"],
  fontSrc: ["'self'", "data:", "https://platform.twitter.com", "https://*.twimg.com", "https://*.x.com"],
  frameSrc: ["https://platform.twitter.com", "https://*.x.com"],
  frameAncestors: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
};

/**
 * Memory usage thresholds for health monitoring and load shedding.
 * All values are in bytes.
 *
 * - `TOTAL_PROCESS_MEMORY_BUDGET_BYTES`: Total memory budget for the entire process (default 2GB)
 * - `IMAGE_RAM_BUDGET_BYTES`: Memory allocated specifically for the image cache (default 512MB)
 * - `MEMORY_WARNING_THRESHOLD`: RSS memory usage that triggers a "warning" state (default 70% of total budget)
 * - `MEMORY_CRITICAL_THRESHOLD`: RSS memory usage that triggers a "critical" state and load shedding (default 90% of total budget)
 * - `IMAGE_STREAM_THRESHOLD_BYTES`: Images larger than this are streamed to S3 (default 5MB)
 */
export const MEMORY_THRESHOLDS = {
  // Total process memory budget (used by mem-guard for RSS monitoring)
  TOTAL_PROCESS_MEMORY_BUDGET_BYTES: Number(process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES ?? 2 * 1024 * 1024 * 1024), // 2GB default

  // Image cache-specific budget (used by ImageMemoryManager)
  // TODO: Consider lowering to 256MB after testing to achieve 600-900MB RSS target
  IMAGE_RAM_BUDGET_BYTES: Number(process.env.IMAGE_RAM_BUDGET_BYTES ?? 512 * 1024 * 1024), // 512MB default

  // Server cache budget (used by ServerCache for general data)
  SERVER_CACHE_BUDGET_BYTES: Number(process.env.SERVER_CACHE_BUDGET_BYTES ?? 256 * 1024 * 1024), // 256MB default

  // Warning threshold based on total process memory (70% of 2GB = 1.4GB)
  MEMORY_WARNING_THRESHOLD: Number(
    process.env.MEMORY_WARNING_THRESHOLD ??
      Number(process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES ?? 2 * 1024 * 1024 * 1024) * 0.7,
  ),

  // Critical threshold based on total process memory (90% of 2GB = 1.8GB)
  MEMORY_CRITICAL_THRESHOLD: Number(
    process.env.MEMORY_CRITICAL_THRESHOLD ??
      Number(process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES ?? 2 * 1024 * 1024 * 1024) * 0.9,
  ),

  IMAGE_STREAM_THRESHOLD_BYTES: Number(process.env.IMAGE_STREAM_THRESHOLD_BYTES ?? 5 * 1024 * 1024), // 5MB default
} as const;

/**
 * Default S3 bucket name used by data-access and utility layers.
 * This is a thin re-export of the `S3_BUCKET` environment variable so that
 * other modules can import a typed constant instead of reading from
 * `process.env` directly.  When the variable is not defined (e.g. local dry-run
 * tests), it resolves to `undefined`, and callers are expected to handle that
 * case gracefully.
 */
export const S3_BUCKET: string | undefined = process.env.S3_BUCKET;
