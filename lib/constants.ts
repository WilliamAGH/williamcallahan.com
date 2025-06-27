/**
 * Application Constants
 * Central location for all application constants.
 */

import type { BookmarksS3Paths, RateLimiterConfig } from "@/types/lib";

// Time helpers (all return milliseconds)
const hours = (h: number) => h * 60 * 60 * 1000;
const days = (d: number) => d * 24 * hours(1);
const minutes = (m: number) => m * 60 * 1000;
const seconds = (s: number) => s * 1000;

/** Client-side cache duration: 30 days (milliseconds) */
export const CACHE_DURATION = days(30);

/** Server-side cache duration: 3 days (seconds) */
export const SERVER_CACHE_DURATION = days(3) / 1000;

// Unified cache configuration factory (seconds) with overloads
function createCacheConfig(success: number, failure: number): { SUCCESS: number; FAILURE: number };
function createCacheConfig(
  success: number,
  failure: number,
  revalidation: number,
): { SUCCESS: number; FAILURE: number; REVALIDATION: number };
function createCacheConfig(success: number, failure: number, revalidation?: number) {
  if (revalidation !== undefined) {
    return {
      SUCCESS: success,
      FAILURE: failure,
      REVALIDATION: revalidation,
    };
  }
  return {
    SUCCESS: success,
    FAILURE: failure,
  };
}

/** Logo cache: 30 days success, 1 day failure */
export const LOGO_CACHE_DURATION = createCacheConfig(days(30) / 1000, days(1) / 1000);

// Environment suffix helper
const envSuffix = (() => {
  const env = process.env.NODE_ENV;
  if (env === "production" || !env) return "";
  return env === "test" ? "-test" : "-dev";
})();

// S3 path builders
const s3Path = (dir: string, file: string) => `${dir}/${file}${envSuffix}.json`;
const s3Dir = (dir: string) => `${dir}${envSuffix}`;

export const BOOKMARKS_S3_PATHS: BookmarksS3Paths = {
  DIR: "json/bookmarks",
  FILE: s3Path("json/bookmarks", "bookmarks"),
  LOCK: s3Path("json/bookmarks", "refresh-lock"),
  INDEX: s3Path("json/bookmarks", "index"),
  PAGE_PREFIX: `json/bookmarks/pages${envSuffix}/page-`,
  TAG_PREFIX: s3Dir("json/bookmarks/tags") + "/",
  TAG_INDEX_PREFIX: s3Dir("json/bookmarks/tags") + "/",
} as const;

export const LOGO_BLOCKLIST_S3_PATH = s3Path("json/image-data/logos", "domain-blocklist");

/** S3 paths for search indexes (environment-aware) */
export const SEARCH_S3_PATHS = {
  DIR: "json/search",
  POSTS_INDEX: s3Path("json/search", "posts-index"),
  BOOKMARKS_INDEX: s3Path("json/search", "bookmarks-index"),
  INVESTMENTS_INDEX: s3Path("json/search", "investments-index"),
  EXPERIENCE_INDEX: s3Path("json/search", "experience-index"),
  EDUCATION_INDEX: s3Path("json/search", "education-index"),
  BUILD_METADATA: s3Path("json/search", "build-metadata"),
} as const;

/** S3 paths for GitHub activity data (environment-aware) */
export const GITHUB_ACTIVITY_S3_PATHS = {
  DIR: "json/github-activity",
  ACTIVITY_DATA: s3Path("json/github-activity", "activity_data"),
  STATS_SUMMARY: s3Path("json/github-activity", "github_stats_summary"),
  ALL_TIME_SUMMARY: s3Path("json/github-activity", "github_stats_summary_all_time"),
  AGGREGATED_WEEKLY: s3Path("json/github-activity", "aggregated_weekly_activity"),
  ACTIVITY_DATA_PROD_FALLBACK: "json/github-activity/activity_data.json",
  REPO_RAW_WEEKLY_STATS_DIR: s3Dir("json/github-activity/repo_raw_weekly_stats"),
} as const;

/** S3 paths for image manifests (environment-aware) */
export const IMAGE_MANIFEST_S3_PATHS = {
  DIR: "json/image-data",
  LOGOS_MANIFEST: s3Path("json/image-data", "logos/manifest"),
  OPENGRAPH_MANIFEST: s3Path("json/image-data", "opengraph/manifest"),
  BLOG_IMAGES_MANIFEST: s3Path("json/image-data", "blog/manifest"),
  EDUCATION_IMAGES_MANIFEST: s3Path("json/image-data", "education/manifest"),
  EXPERIENCE_IMAGES_MANIFEST: s3Path("json/image-data", "experience/manifest"),
  INVESTMENTS_IMAGES_MANIFEST: s3Path("json/image-data", "investments/manifest"),
  PROJECTS_IMAGES_MANIFEST: s3Path("json/image-data", "projects/manifest"),
} as const;

/**
 * S3 storage paths for OpenGraph JSON data (environment-aware).
 *
 * Stores OpenGraph metadata and manifests in JSON format.
 * NOT for image files - those go in IMAGE_S3_PATHS.OPENGRAPH_DIR
 *
 * Production  → json/opengraph/
 * Development → json/opengraph/
 * Test        → json/opengraph/
 */
export const OPENGRAPH_JSON_S3_PATHS = {
  DIR: "json/opengraph",
} as const;

/**
 * S3 storage paths for actual image files (PNG, JPG, etc).
 *
 * Images are stored by type for better organization and CDN caching.
 * These are binary image files, NOT JSON metadata.
 */
export const IMAGE_S3_PATHS = {
  LOGOS_DIR: "images/logos",
  OPENGRAPH_DIR: "images/opengraph", // OpenGraph preview images (.png, .jpg, etc)
  BLOG_DIR: "images/blog",
  OTHER_DIR: "images/other",
} as const;

/** Bookmarks cache: 7 days success, 1 hour failure/revalidation */
export const BOOKMARKS_CACHE_DURATION = createCacheConfig(days(7) / 1000, hours(1) / 1000, hours(1) / 1000);

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

/** GitHub activity cache: 24 hours success, 1 hour failure, 6 hours revalidation */
export const GITHUB_ACTIVITY_CACHE_DURATION = createCacheConfig(days(1) / 1000, hours(1) / 1000, hours(6) / 1000);

/** Search cache: 15 minutes success, 1 minute failure, 10 minutes revalidation */
export const SEARCH_CACHE_DURATION = createCacheConfig(minutes(15) / 1000, 60, minutes(10) / 1000);

/** Base URLs */
export const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || NEXT_PUBLIC_SITE_URL;

/** API endpoints */
export const ENDPOINTS = {
  validateLogo: `${API_BASE_URL}/api/validate-logo`,
  logo: `${API_BASE_URL}/api/logo`,
} as const;

/** Logo source URL generators */
const logoUrl = (base: string, domain: string, size?: number) =>
  size ? `${base}${domain}&sz=${size}` : `${base}${domain}`;

export const LOGO_SOURCES = {
  google: {
    hd: (d: string) => logoUrl("https://www.google.com/s2/favicons?domain=", d, 256),
    md: (d: string) => logoUrl("https://www.google.com/s2/favicons?domain=", d, 128),
    sm: (d: string) => logoUrl("https://www.google.com/s2/favicons?domain=", d, 64),
  },
  duckduckgo: {
    hd: (d: string) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
    md: (d: string) => `https://external-content.duckduckgo.com/ip3/${d}.ico`,
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

/** Memory thresholds (bytes) */
const GB = 1024 * 1024 * 1024;
const MB = 1024 * 1024;
// Modern Next.js dev builds can exceed 3 GB RSS; use 4 GB default in dev to avoid false alarms.
const defaultBudget = process.env.NODE_ENV === "production" ? 3.75 * GB : 4 * GB;
const totalBudget = Number(process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES ?? defaultBudget);

export const MEMORY_THRESHOLDS = {
  TOTAL_PROCESS_MEMORY_BUDGET_BYTES: totalBudget,
  IMAGE_RAM_BUDGET_BYTES: Number(process.env.IMAGE_RAM_BUDGET_BYTES ?? Math.floor(totalBudget * 0.15)),
  SERVER_CACHE_BUDGET_BYTES: Number(process.env.SERVER_CACHE_BUDGET_BYTES ?? Math.floor(totalBudget * 0.15)),
  MEMORY_WARNING_THRESHOLD: Number(process.env.MEMORY_WARNING_THRESHOLD ?? totalBudget * 0.7),
  MEMORY_CRITICAL_THRESHOLD: Number(process.env.MEMORY_CRITICAL_THRESHOLD ?? totalBudget * 0.9),
  IMAGE_STREAM_THRESHOLD_BYTES: Number(process.env.IMAGE_STREAM_THRESHOLD_BYTES ?? 5 * MB),
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

/** Time constants (milliseconds) */
export const TIME_CONSTANTS = {
  ONE_HOUR_MS: hours(1),
  TWENTY_FOUR_HOURS_MS: days(1),
  FIVE_MINUTES_MS: minutes(5),
  TWO_MINUTES_MS: minutes(2),
  DEFAULT_JITTER_MS: minutes(5),
  RATE_LIMIT_WINDOW_MS: hours(1),
  LOCK_TTL_MS: minutes(5),
  LOGO_RETRY_COOLDOWN_MS: days(1),
  BOOKMARKS_PRELOAD_INTERVAL_MS: hours(2),
} as const;

/**
 * Default image paths used as fallbacks
 * @constant
 * @type {Object}
 */
export const DEFAULT_IMAGES = {
  /** Default OpenGraph logo for the site owner */
  OPENGRAPH_LOGO: "/images/william-callahan-san-francisco.png",
  /** Placeholder image for companies without logos */
  COMPANY_PLACEHOLDER: "/images/company-placeholder.svg",
} as const;

/** OpenGraph S3 directories */
export const OPENGRAPH_S3_KEY_DIR = OPENGRAPH_JSON_S3_PATHS.DIR;
export const OPENGRAPH_METADATA_S3_DIR = `${OPENGRAPH_JSON_S3_PATHS.DIR}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = IMAGE_S3_PATHS.OPENGRAPH_DIR;
export const OPENGRAPH_JINA_HTML_S3_DIR = `${OPENGRAPH_JSON_S3_PATHS.DIR}/jina-html`;
export const OPENGRAPH_OVERRIDES_S3_DIR = `${OPENGRAPH_JSON_S3_PATHS.DIR}/overrides`;

/**
 * OpenGraph Fetch Configuration with environment variable overrides
 * @constant
 * @type {Object}
 */
export const OPENGRAPH_FETCH_CONFIG = {
  TIMEOUT: Number(process.env.OG_FETCH_TIMEOUT_MS) || 7000, // 7 seconds default (reduced from 10s)
  MAX_RETRIES: Number(process.env.OG_MAX_RETRIES) || 2, // 2 retries default (reduced from 3)
  BACKOFF_BASE: Number(process.env.OG_RETRY_DELAY_MS) || 1000, // 1 second
  MAX_BACKOFF: 5000, // 5 seconds
  MAX_HTML_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  PARTIAL_HTML_SIZE: 512 * 1024, // 512KB for partial parsing
} as const;

/** OpenGraph cache: 24 hours success, 1 hour failure */
export const OPENGRAPH_CACHE_DURATION = createCacheConfig(days(1) / 1000, hours(1) / 1000);

/** Jina AI fetch limiter: 10 fetches per 24 hours */
export const JINA_FETCH_CONFIG: RateLimiterConfig = {
  maxRequests: 10,
  windowMs: days(1),
};

/** Rate limiter factory */
const createRateLimiter = (maxRequests: number, windowMs: number): RateLimiterConfig => ({ maxRequests, windowMs });

/** Default API endpoint rate limit: 5 requests per minute */
export const DEFAULT_API_ENDPOINT_LIMIT_CONFIG = createRateLimiter(5, minutes(1));
export const API_ENDPOINT_STORE_NAME = "apiEndpoints";

/** OpenGraph fetch rate limit: 10 requests per second */
export const DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG = createRateLimiter(10, seconds(1));

export const OPENGRAPH_FETCH_STORE_NAME = "outgoingOpenGraph";
export const OPENGRAPH_FETCH_CONTEXT_ID = "global";

/** SEO date field constants */
export const SEO_DATE_FIELDS = {
  openGraph: {
    published: "article:published_time",
    modified: "article:modified_time",
  },
  meta: {
    published: "date",
    modified: "last-modified",
  },
  jsonLd: {
    context: "https://schema.org",
    dateFields: {
      created: "dateCreated",
      published: "datePublished",
      modified: "dateModified",
    },
    types: {
      profile: "ProfilePage",
      article: "Article",
      person: "Person",
      collection: "CollectionPage",
    },
  },
  dublinCore: {
    created: "DC.date.created",
    modified: "DC.date.modified",
    issued: "DC.date.issued",
  },
} as const;

export const INDEXING_RATE_LIMIT_PATH = s3Path("json/search", "indexing-rate-limit");

// Cache TTL constants (in seconds) - moved from lib/cache.ts to break circular dependency
export const CACHE_TTL = {
  DEFAULT: 30 * 24 * 60 * 60, // 30 days
  DAILY: 24 * 60 * 60, // 24 hours
  HOURLY: 60 * 60, // 1 hour
} as const;

// Migration helpers for Next.js 15 'use cache' directive
export const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE === "true";

export const JINA_FETCH_STORE_NAME = "jinaFetch" as const;
export const JINA_FETCH_CONTEXT_ID = "global" as const;
export const JINA_FETCH_RATE_LIMIT_S3_PATH = s3Path("json/rate-limit", "jina-fetch-limiter");
