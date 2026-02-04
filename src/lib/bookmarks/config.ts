/**
 * @file Centralized configuration for bookmarks module
 * @module lib/bookmarks/config
 *
 * Consolidates environment-based configuration that was previously duplicated
 * across bookmarks-data-access.server.ts, service.server.ts, and slug-manager.ts.
 */

import { envLogger } from "@/lib/utils/env-logger";

// ============================================================================
// Logging Configuration
// ============================================================================

/**
 * Whether bookmark service debug logging is enabled.
 * Checks multiple environment variables for flexibility in different contexts.
 */
export const isBookmarkServiceLoggingEnabled =
  process.env.DEBUG_BOOKMARKS === "true" ||
  process.env.DEBUG_BOOKMARKS_SERVICE === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

/**
 * Whether we're in a test environment.
 * Used to suppress verbose logging during tests.
 */
const isTestEnvironment =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  process.env.JEST_WORKER_ID !== undefined;

/**
 * Whether slug manager debug logging is enabled.
 * Uses production mode or explicit debug flags, but disabled in test environments
 * to keep test output clean (only errors should appear).
 */
export const isSlugManagerLoggingEnabled =
  !isTestEnvironment &&
  (process.env.NODE_ENV === "production" ||
    process.env.DEBUG_SLUG_MANAGER === "true" ||
    process.env.DEBUG === "true" ||
    process.env.VERBOSE === "true");

// ============================================================================
// Tag Persistence Configuration
// ============================================================================

/**
 * Whether tag persistence to S3 is enabled.
 * Defaults to true unless explicitly disabled.
 */
export const ENABLE_TAG_PERSISTENCE = process.env.ENABLE_TAG_PERSISTENCE !== "false";

// Parse MAX_TAGS_TO_PERSIST with robust validation
const RAW_MAX_TAGS = process.env.MAX_TAGS_TO_PERSIST;
const PARSED_MAX_TAGS = RAW_MAX_TAGS != null ? Number(RAW_MAX_TAGS) : Number.NaN;

/**
 * Maximum number of tags to persist to S3.
 * Defaults to unlimited (MAX_SAFE_INTEGER) when not set or invalid.
 */
export const MAX_TAGS_TO_PERSIST =
  Number.isFinite(PARSED_MAX_TAGS) && PARSED_MAX_TAGS > 0
    ? Math.floor(PARSED_MAX_TAGS)
    : Number.MAX_SAFE_INTEGER;

// Log warning for invalid MAX_TAGS_TO_PERSIST values
if (RAW_MAX_TAGS && (!Number.isFinite(PARSED_MAX_TAGS) || PARSED_MAX_TAGS <= 0)) {
  envLogger.debug(
    "MAX_TAGS_TO_PERSIST is invalid or <= 0; defaulting to unlimited persistence",
    { RAW_MAX_TAGS },
    { category: "BookmarksConfig" },
  );
}

// ============================================================================
// Log Categories
// ============================================================================

export const LOG_PREFIX = "[BookmarksDataAccess]";
export const BOOKMARK_SERVICE_LOG_CATEGORY = "BookmarksDataAccess";

// ============================================================================
// Memory Cache Configuration
// ============================================================================

/**
 * Time-to-live for the full bookmarks dataset memory cache.
 * After this duration, the cache is considered stale and will be refreshed from S3.
 */
export const FULL_DATASET_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Time-to-live for individual bookmark-by-id memory cache entries.
 * Matches the full dataset cache for consistency.
 */
export const BOOKMARK_BY_ID_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Maximum number of individual bookmarks to cache in memory.
 * Uses LRU eviction when limit is reached.
 */
export const BOOKMARK_BY_ID_CACHE_LIMIT = 1024;

// ============================================================================
// Batch Processing Configuration
// ============================================================================

/**
 * Number of bookmarks to write concurrently when persisting by-id files.
 * Limits concurrent S3 writes to avoid rate limiting.
 */
export const BOOKMARK_WRITE_BATCH_SIZE = 25;

/**
 * Maximum number of bookmarks to process during metadata-only refresh.
 * Conservative cap to avoid excessive network during periodic runs.
 */
export const METADATA_REFRESH_MAX_ITEMS = 50;
