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
 * Whether slug manager debug logging is enabled.
 * Uses production mode or explicit debug flags.
 */
export const isSlugManagerLoggingEnabled =
  process.env.NODE_ENV === "production" ||
  process.env.DEBUG_SLUG_MANAGER === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

// ============================================================================
// Local S3 Cache Configuration
// ============================================================================

const forceLocalS3Cache = process.env.FORCE_LOCAL_S3_CACHE === "true";
const allowRuntimeFallback = process.env.ALLOW_RUNTIME_S3_FALLBACK !== "false";
const nextPhase = process.env.NEXT_PHASE;
const isBuildPhase = nextPhase === "phase-production-build";
const isRuntimePhase = !isBuildPhase;
const isRunningInDocker = process.env.RUNNING_IN_DOCKER === "true";

/**
 * Whether to skip the local S3 cache.
 *
 * Build phase: Always skips local cache (unless FORCE_LOCAL_S3_CACHE is set)
 * Runtime phase in Docker: Skips by default, but ALLOW_RUNTIME_S3_FALLBACK=false restores old behavior
 *
 * This ensures Docker runtimes can serve cached data even when S3/CDN is offline.
 */
export const shouldSkipLocalS3Cache =
  !forceLocalS3Cache &&
  (isBuildPhase || (!allowRuntimeFallback && isRunningInDocker && isRuntimePhase));

/**
 * Simplified skip check for slug-manager (original behavior).
 * Skips during Docker runtime but allows during build phase.
 */
export const shouldSkipLocalS3CacheForSlugManager =
  !forceLocalS3Cache && isRunningInDocker && nextPhase !== "phase-production-build";

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
