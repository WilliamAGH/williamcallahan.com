/**
 * Application Constants - Central location for all application constants
 *
 * CRITICAL HYDRATION WARNING:
 * ===========================
 * This file imports server-only dependencies (S3 utilities, which use AWS SDK and node:crypto).
 * Client components that import from this file will cause hydration errors.
 *
 * CLIENT COMPONENTS MUST IMPORT FROM: lib/constants/client.ts
 *
 * This file is being gradually deprecated in favor of:
 * - lib/constants/client.ts - Client-safe constants only
 * - lib/constants/server.ts - Server-only constants (to be created)
 *
 * @see https://github.com/WilliamAGH/williamcallahan.com/issues/175
 * @deprecated Use lib/constants/client.ts for client components
 */
import type { BookmarksS3Paths, RateLimiterConfig } from "@/types/lib";
import type { BookmarkLoadOptions } from "@/types/bookmark";
import { getStaticImageUrl } from "@/lib/data-access/static-images";
import { ENVIRONMENT_SUFFIX } from "@/lib/config/environment";
import { envLogger } from "@/lib/utils/env-logger";

// Use validated environment suffix from centralized config
const envSuffix = ENVIRONMENT_SUFFIX;

// Warn if environment is not properly configured
if (typeof process !== "undefined" && !process.env.NODE_ENV) {
  envLogger.log("NODE_ENV not set - using environment suffix", envSuffix, { category: "Constants" });
}

/** Client-side cache duration: 30 days (milliseconds) */
export const CACHE_DURATION = 30 * 24 * 60 * 60 * 1000;
/** Server-side cache duration: 3 days (seconds) */
export const SERVER_CACHE_DURATION = 3 * 24 * 60 * 60;
/** Logo cache: 30 days success, 1 day failure */
export const LOGO_CACHE_DURATION = { SUCCESS: 30 * 24 * 60 * 60, FAILURE: 24 * 60 * 60 };

export const BOOKMARKS_S3_PATHS: BookmarksS3Paths = {
  DIR: "json/bookmarks",
  FILE: `json/bookmarks/bookmarks${envSuffix}.json`,
  LOCK: `json/bookmarks/refresh-lock${envSuffix}.json`,
  INDEX: `json/bookmarks/index${envSuffix}.json`,
  PAGE_PREFIX: `json/bookmarks/pages${envSuffix}/page-`,
  TAG_PREFIX: `json/bookmarks/tags${envSuffix}/`,
  TAG_INDEX_PREFIX: `json/bookmarks/tags${envSuffix}/`,
  HEARTBEAT: `json/bookmarks/heartbeat${envSuffix}.json`,
  SLUG_MAPPING: `json/bookmarks/slug-mapping${envSuffix}.json`,
} as const;

export const LOGO_BLOCKLIST_S3_PATH = `json/rate-limit/logo-failed-domains${envSuffix}.json`;

/**
 * S3 paths for content graph (environment-aware)
 * Note: DIR includes the environment suffix and leaf files are unsuffixed by design.
 * This keeps the content-graph directory environment-scoped while file names stay stable.
 */
export const CONTENT_GRAPH_S3_PATHS = {
  DIR: `json/content-graph${envSuffix}`,
  RELATED_CONTENT: `json/content-graph${envSuffix}/related-content.json`,
  TAG_GRAPH: `json/content-graph${envSuffix}/tag-graph.json`,
  METADATA: `json/content-graph${envSuffix}/metadata.json`,
} as const;

/**
 * S3 paths for search indexes (environment-aware)
 * Note: DIR is global; each leaf file appends the environment suffix.
 */
export const SEARCH_S3_PATHS = {
  DIR: "json/search",
  POSTS_INDEX: `json/search/posts-index${envSuffix}.json`,
  BOOKMARKS_INDEX: `json/search/bookmarks-index${envSuffix}.json`,
  INVESTMENTS_INDEX: `json/search/investments-index${envSuffix}.json`,
  EXPERIENCE_INDEX: `json/search/experience-index${envSuffix}.json`,
  EDUCATION_INDEX: `json/search/education-index${envSuffix}.json`,
  PROJECTS_INDEX: `json/search/projects-index${envSuffix}.json`,
  BUILD_METADATA: `json/search/build-metadata${envSuffix}.json`,
} as const;

/**
 * S3 paths for GitHub activity data (environment-aware)
 * Note: DIR is global; each leaf file appends the environment suffix.
 */
export const GITHUB_ACTIVITY_S3_PATHS = {
  DIR: "json/github-activity",
  ACTIVITY_DATA: `json/github-activity/activity_data${envSuffix}.json`,
  STATS_SUMMARY: `json/github-activity/github_stats_summary${envSuffix}.json`,
  ALL_TIME_SUMMARY: `json/github-activity/github_stats_summary_all_time${envSuffix}.json`,
  AGGREGATED_WEEKLY: `json/github-activity/aggregated_weekly_activity${envSuffix}.json`,
  ACTIVITY_DATA_PROD_FALLBACK: "json/github-activity/activity_data.json",
  REPO_RAW_WEEKLY_STATS_DIR: `json/github-activity/repo_raw_weekly_stats${envSuffix}`,
} as const;

/**
 * S3 paths for image manifests (environment-aware)
 * Note: DIR is global; each leaf file appends the environment suffix.
 */
export const IMAGE_MANIFEST_S3_PATHS = {
  DIR: "json/image-data",
  LOGOS_MANIFEST: `json/image-data/logos/manifest${envSuffix}.json`,
  OPENGRAPH_MANIFEST: `json/image-data/opengraph/manifest${envSuffix}.json`,
  BLOG_IMAGES_MANIFEST: `json/image-data/blog/manifest${envSuffix}.json`,
  EDUCATION_IMAGES_MANIFEST: `json/image-data/education/manifest${envSuffix}.json`,
  EXPERIENCE_IMAGES_MANIFEST: `json/image-data/experience/manifest${envSuffix}.json`,
  INVESTMENTS_IMAGES_MANIFEST: `json/image-data/investments/manifest${envSuffix}.json`,
  PROJECTS_IMAGES_MANIFEST: `json/image-data/projects/manifest${envSuffix}.json`,
} as const;

/** S3 storage paths for OpenGraph JSON data (environment-aware) */
export const OPENGRAPH_JSON_S3_PATHS = { DIR: "json/opengraph" } as const;

/** S3 storage paths for actual image files (PNG, JPG, etc) */
export const IMAGE_S3_PATHS = {
  LOGOS_DIR: "images/logos",
  OPENGRAPH_DIR: "images/opengraph", // OpenGraph images for bookmarks
  BLOG_DIR: "images/blog",
  OTHER_DIR: "images/other",
} as const;

/** Bookmarks cache: 7 days success, 1 hour failure/revalidation */
export const BOOKMARKS_CACHE_DURATION = { SUCCESS: 7 * 24 * 60 * 60, FAILURE: 60 * 60, REVALIDATION: 60 * 60 };

/** Bookmarks API configuration */
// Normalize Karakeep API base URL: ensure it ends with /api/v1
const RAW_BOOKMARKS_API = process.env.BOOKMARKS_API_URL ?? "https://bookmark.iocloudhost.net";
const NORMALIZED_BOOKMARKS_API = /\/api(\/v\d+)?\/?$/.test(RAW_BOOKMARKS_API)
  ? RAW_BOOKMARKS_API.replace(/\/?$/, "")
  : `${RAW_BOOKMARKS_API.replace(/\/?$/, "")}/api/v1`;

export const BOOKMARKS_API_CONFIG = {
  API_URL: NORMALIZED_BOOKMARKS_API,
  LIST_ID: process.env.BOOKMARKS_LIST_ID,
  BEARER_TOKEN: process.env.BOOKMARK_BEARER_TOKEN,
  REQUEST_TIMEOUT_MS: 10_000,
} as const;

/** Number of bookmarks displayed per page in paginated views (used in sitemap.ts, bookmarks/*) */
export const BOOKMARKS_PER_PAGE = 24;

/** Default options for getBookmarks calls - explicit parameters for clarity and ZERO TEMPERATURE compliance */
export const DEFAULT_BOOKMARK_OPTIONS: Readonly<Required<BookmarkLoadOptions>> = {
  includeImageData: true,
  skipExternalFetch: false,
  force: false,
} as const;

/** GitHub activity cache: 24 hours success, 1 hour failure, 6 hours revalidation */
export const GITHUB_ACTIVITY_CACHE_DURATION = { SUCCESS: 24 * 60 * 60, FAILURE: 60 * 60, REVALIDATION: 6 * 60 * 60 };

/** Search cache: 15 minutes success, 1 minute failure, 10 minutes revalidation */
export const SEARCH_CACHE_DURATION = { SUCCESS: 15 * 60, FAILURE: 60, REVALIDATION: 10 * 60 };

/** Base URLs */
export const NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://williamcallahan.com";
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || NEXT_PUBLIC_SITE_URL;
/** API endpoints */
export const ENDPOINTS = {
  validateLogo: `${API_BASE_URL}/api/validate-logo`,
  logo: `${API_BASE_URL}/api/logo`,
} as const;

import type { LogoSourcesConfig } from "@/types/logo";

const gf = (sz: string) => (d: string) => `https://www.google.com/s2/favicons?domain=${d}&sz=${sz}`; // Google favicon
const df = (path: string) => (d: string) => `https://${d}/${path}`; // Direct favicon

/** Logo source URL generators */
export const LOGO_SOURCES: LogoSourcesConfig = {
  google: { hd: gf("256"), md: gf("128"), sm: gf("64") },
  duckduckgo: {
    hd: (d: string) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
    md: (d: string) => `https://external-content.duckduckgo.com/ip3/${d}.ico`,
  },
  clearbit: { hd: (d: string) => `https://logo.clearbit.com/${d}` },
  direct: {
    favicon: df("favicon.ico"),
    faviconPng: df("favicon.png"),
    faviconSvg: df("favicon.svg"),
    appleTouchIcon: df("apple-touch-icon.png"),
    appleTouchIconPrecomposed: df("apple-touch-icon-precomposed.png"),
    appleTouchIcon180: df("apple-touch-icon-180x180.png"),
    appleTouchIcon152: df("apple-touch-icon-152x152.png"),
    androidChrome192: df("android-chrome-192x192.png"),
    androidChrome512: df("android-chrome-512x512.png"),
    favicon32: df("favicon-32x32.png"),
    favicon16: df("favicon-16x16.png"),
  },
};

/** Regular expressions to identify generic globe icons */
export const GENERIC_GLOBE_PATTERNS = [
  /\/faviconV2\?.*&fallback_opts=.*&type=DEFAULT/i,
  /\/faviconV2\?.*&fallback_opts=.*&type=FAVICON.*&err=1/i,
  /\/ip3\/[^/]+\.ico.*\?v=\d+/i,
  /\/ip3\/[^/]+\.ico\?f=1/i,
  /logo\.clearbit\.com\/.*\?.*&default/i,
] as const;

/** Valid image formats for logo processing */
export const VALID_IMAGE_FORMATS = ["jpeg", "png", "webp", "gif", "svg", "ico"] as const;
/** Minimum size for logo images (64 pixels) */
export const MIN_LOGO_SIZE = 64;
/** Standard Tailwind CSS breakpoints (min-width for JavaScript calculations) */
export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 } as const;
/** Desired logo sizes */
export const LOGO_SIZES = { HD: 256, MD: 128, SM: 64 } as const;
/** Maximum allowed difference in dimensions for image comparison (10 pixels) */
export const MAX_SIZE_DIFF = 10;
/** Key for storing the theme timestamp in localStorage */
export const THEME_TIMESTAMP_KEY = "theme-timestamp";

/** Hardcoded domains for logo fetching (key institutional/service domains) */
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

/** Time constants (milliseconds) */
const MIN = 60 * 1000,
  HOUR = 60 * MIN,
  DAY = 24 * HOUR;
export const TIME_CONSTANTS = {
  ONE_HOUR_MS: HOUR,
  TWENTY_FOUR_HOURS_MS: DAY,
  FIVE_MINUTES_MS: 5 * MIN,
  TWO_MINUTES_MS: 2 * MIN,
  DEFAULT_JITTER_MS: 5 * MIN,
  RATE_LIMIT_WINDOW_MS: HOUR,
  LOCK_TTL_MS: 5 * MIN,
  LOGO_RETRY_COOLDOWN_MS: DAY,
  BOOKMARKS_PRELOAD_INTERVAL_MS: 2 * HOUR,
} as const;

/** Default image paths used as fallbacks */
export const DEFAULT_IMAGES = {
  OPENGRAPH_LOGO: getStaticImageUrl("/images/william-callahan-san-francisco.png"),
  COMPANY_PLACEHOLDER: getStaticImageUrl("/images/company-placeholder.svg"),
} as const;

/** OpenGraph S3 directories */
const ogDir = OPENGRAPH_JSON_S3_PATHS.DIR;
export const OPENGRAPH_S3_KEY_DIR = ogDir;
export const OPENGRAPH_METADATA_S3_DIR = `${ogDir}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = IMAGE_S3_PATHS.OPENGRAPH_DIR;
export const OPENGRAPH_JINA_HTML_S3_DIR = `${ogDir}/jina-html`;
export const OPENGRAPH_OVERRIDES_S3_DIR = `${ogDir}/overrides`;

/** OpenGraph Fetch Configuration with environment variable overrides */
export const OPENGRAPH_FETCH_CONFIG = {
  TIMEOUT: Number(process.env.OG_FETCH_TIMEOUT_MS) || 15000,
  MAX_RETRIES: Number(process.env.OG_MAX_RETRIES) || 2,
  BACKOFF_BASE: Number(process.env.OG_RETRY_DELAY_MS) || 1000,
  MAX_BACKOFF: 5000,
  MAX_HTML_SIZE_BYTES: 5 * 1024 * 1024,
  PARTIAL_HTML_SIZE: 512 * 1024,
} as const;

/** OpenGraph cache: 24 hours success, 1 hour failure */
export const OPENGRAPH_CACHE_DURATION = { SUCCESS: 24 * 60 * 60, FAILURE: 60 * 60 };
/** Jina AI fetch limiter: 10 fetches per 24 hours */
export const JINA_FETCH_CONFIG: RateLimiterConfig = { maxRequests: 10, windowMs: 24 * 60 * 60 * 1000 };
/** Default API endpoint rate limit: 5 requests per minute */
export const DEFAULT_API_ENDPOINT_LIMIT_CONFIG: RateLimiterConfig = { maxRequests: 5, windowMs: 60 * 1000 };
export const API_ENDPOINT_STORE_NAME = "apiEndpoints";
/** OpenGraph fetch rate limit: 10 requests per second */
export const DEFAULT_OPENGRAPH_FETCH_LIMIT_CONFIG: RateLimiterConfig = { maxRequests: 10, windowMs: 1000 };
export const OPENGRAPH_FETCH_STORE_NAME = "outgoingOpenGraph";
export const OPENGRAPH_FETCH_CONTEXT_ID = "global";

/** SEO date field constants */
export const SEO_DATE_FIELDS = {
  openGraph: { published: "article:published_time", modified: "article:modified_time" },
  meta: { published: "date", modified: "last-modified" },
  jsonLd: {
    context: "https://schema.org",
    dateFields: { created: "dateCreated", published: "datePublished", modified: "dateModified" },
    types: { profile: "ProfilePage", article: "Article", person: "Person", collection: "CollectionPage" },
  },
  dublinCore: { created: "DC.date.created", modified: "DC.date.modified", issued: "DC.date.issued" },
} as const;

export const INDEXING_RATE_LIMIT_PATH = `json/rate-limit/search-indexing-limiter${envSuffix}.json`;

// Cache TTL constants (in seconds) - moved from lib/cache.ts to break circular dependency
export const CACHE_TTL = { DEFAULT: 30 * 24 * 60 * 60, DAILY: 24 * 60 * 60, HOURLY: 60 * 60 } as const;

/** SEO Title Suffixes for dynamic pages */
export const SEO_TITLE_SUFFIXES = {
  BLOG: "William Callahan's Blog",
  BOOKMARKS: "William Callahan's Bookmarks",
  DEFAULT: "William Callahan's Homepage - San Francisco",
} as const;

/** Common redundant prefixes to remove from titles to save space */
export const SEO_TITLE_REDUNDANT_PREFIXES = [
  "GitHub - ",
  "GitHub",
  "GitLab - ",
  "GitLab",
  "npm - ",
  "npm",
  "PyPI - ",
  "PyPI",
] as const;

// Migration helpers for Next.js 15 'use cache' directive - default to true
export const USE_NEXTJS_CACHE = process.env.USE_NEXTJS_CACHE !== "false";

export const JINA_FETCH_STORE_NAME = "jinaFetch" as const;
export const JINA_FETCH_CONTEXT_ID = "global" as const;
export const JINA_FETCH_RATE_LIMIT_S3_PATH = `json/rate-limit/jina-fetch-limiter${envSuffix}.json`;

// GitHub activity re-exports for data access layer
const ghPaths = GITHUB_ACTIVITY_S3_PATHS;
export const GITHUB_ACTIVITY_S3_KEY_DIR = ghPaths.DIR;
export const GITHUB_ACTIVITY_S3_KEY_FILE = ghPaths.ACTIVITY_DATA;
export const GITHUB_ACTIVITY_S3_KEY_FILE_FALLBACK = ghPaths.ACTIVITY_DATA_PROD_FALLBACK;
export const GITHUB_STATS_SUMMARY_S3_KEY_FILE = ghPaths.STATS_SUMMARY;
export const ALL_TIME_SUMMARY_S3_KEY_FILE = ghPaths.ALL_TIME_SUMMARY;
export const REPO_RAW_WEEKLY_STATS_S3_KEY_DIR = ghPaths.REPO_RAW_WEEKLY_STATS_DIR;
export const AGGREGATED_WEEKLY_ACTIVITY_S3_KEY_FILE = ghPaths.AGGREGATED_WEEKLY;

/** Unified Image Service default configuration */
export const UNIFIED_IMAGE_SERVICE_CONFIG = {
  // Session / circuit-breaker
  SESSION_MAX_DURATION: 30 * 60 * 1000,
  MAX_RETRIES_PER_SESSION: 3,
  PERMANENT_FAILURE_THRESHOLD: 5,
  // Upload retry behaviour
  MAX_UPLOAD_RETRIES: 3,
  RETRY_BASE_DELAY: TIME_CONSTANTS.FIVE_MINUTES_MS / 5,
  RETRY_MAX_DELAY: TIME_CONSTANTS.FIVE_MINUTES_MS,
  RETRY_JITTER_FACTOR: 0.3,
  // Timeouts
  FETCH_TIMEOUT: 30_000,
  LOGO_FETCH_TIMEOUT: 5_000,
  // Validation thresholds
  MIN_BUFFER_SIZE: 100,
  MIN_LOGO_SIZE: 16,
  ASPECT_RATIO_TOLERANCE: 2,
  // Memory / safety bounds
  MAX_SESSION_DOMAINS: 500,
  MAX_RETRY_QUEUE_SIZE: 50,
  MAX_BLOCKLIST_SIZE: 5_000,
  MAX_IN_FLIGHT_REQUESTS: 25,
  MAX_MIGRATION_LOCKS: 10,
  // House-keeping
  CLEANUP_INTERVAL: TIME_CONSTANTS.TWO_MINUTES_MS,
  MEMORY_CHECK_INTERVAL: 1_000,
} as const;

/** Memory thresholds (bytes) */
const GB = 1024 * 1024 * 1024,
  MB = 1024 * 1024;
// Auto-detect container memory limit (cgroups) to set accurate process budgets.
// Falls back to env override or sane defaults.
function detectCgroupMemoryLimitBytes(): number | null {
  try {
    // Guard against Edge/runtime environments without Node APIs
    if (typeof process === "undefined" || !process.versions?.node) return null;

    // Use dynamic require to avoid bundling issues in edge contexts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("node:fs") as typeof import("node:fs");

    const candidates = [
      "/sys/fs/cgroup/memory.max", // cgroup v2
      "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, "utf8").trim();
          if (!raw || raw === "max") continue; // "max" means no limit enforced
          const parsed = Number(raw);
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      } catch {
        // Continue to next candidate
      }
    }
  } catch {
    // Ignore detection errors
  }
  return null;
}

const envBudgetRaw = process.env.TOTAL_PROCESS_MEMORY_BUDGET_BYTES;
const envBudget = envBudgetRaw != null ? Number(envBudgetRaw) : NaN;
const cgroupLimitBytes = detectCgroupMemoryLimitBytes();
const defaultBudget = process.env.NODE_ENV === "production" ? 3.75 * GB : 4 * GB;

// Prefer explicit env override, then cgroup limit (with 5% safety headroom), else defaults.
const totalBudget =
  Number.isFinite(envBudget) && envBudget > 0
    ? envBudget
    : cgroupLimitBytes && cgroupLimitBytes > 0
      ? Math.max(Math.floor(cgroupLimitBytes * 0.95), 512 * MB) // never below 512MB
      : defaultBudget;

export const MEMORY_THRESHOLDS = {
  TOTAL_PROCESS_MEMORY_BUDGET_BYTES: totalBudget,
  IMAGE_RAM_BUDGET_BYTES: Number(process.env.IMAGE_RAM_BUDGET_BYTES ?? Math.floor(totalBudget * 0.15)),
  SERVER_CACHE_BUDGET_BYTES: Number(process.env.SERVER_CACHE_BUDGET_BYTES ?? Math.floor(totalBudget * 0.15)),
  MEMORY_WARNING_THRESHOLD: Number(process.env.MEMORY_WARNING_THRESHOLD ?? totalBudget * 0.7),
  MEMORY_CRITICAL_THRESHOLD: Number(process.env.MEMORY_CRITICAL_THRESHOLD ?? totalBudget * 0.9),
  IMAGE_STREAM_THRESHOLD_BYTES: Number(process.env.IMAGE_STREAM_THRESHOLD_BYTES ?? 5 * MB),
} as const;

/** Default S3 bucket name (callers handle undefined gracefully) */
export const S3_BUCKET: string | undefined = process.env.S3_BUCKET;
