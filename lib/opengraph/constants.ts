/**
 * OpenGraph Constants Module
 *
 * Centralized constants for OpenGraph functionality
 * Single source of truth for configuration values
 *
 * @module opengraph/constants
 */

// S3 Directory Structure
export const OPENGRAPH_S3_KEY_DIR = "opengraph";
export const OPENGRAPH_METADATA_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/metadata`;
export const OPENGRAPH_IMAGES_S3_DIR = "images/opengraph";
export const OPENGRAPH_JINA_HTML_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/jina-html`;
export const OPENGRAPH_OVERRIDES_S3_DIR = `${OPENGRAPH_S3_KEY_DIR}/overrides`;

// Fetch Configuration with environment variable overrides
export const OPENGRAPH_FETCH_CONFIG = {
  TIMEOUT: Number(process.env.OG_FETCH_TIMEOUT_MS) || 7000, // 7 seconds default (reduced from 10s)
  MAX_RETRIES: Number(process.env.OG_MAX_RETRIES) || 2, // 2 retries default (reduced from 3)
  BACKOFF_BASE: Number(process.env.OG_RETRY_DELAY_MS) || 1000, // 1 second
  MAX_BACKOFF: 5000, // 5 seconds
  MAX_HTML_SIZE_BYTES: 5 * 1024 * 1024, // 5MB
  PARTIAL_HTML_SIZE: 512 * 1024, // 512KB for partial parsing
};

// Cache Duration (in seconds)
export const OPENGRAPH_CACHE_DURATION = {
  SUCCESS: 24 * 60 * 60, // 24 hours
  FAILURE: 60 * 60, // 1 hour
};

// Rate Limiting
export const OPENGRAPH_FETCH_CONTEXT_ID = "opengraph";
export const OPENGRAPH_FETCH_STORE_NAME = "opengraph-fetch";

// Circuit Breaker
export const CIRCUIT_BREAKER_CONFIG = {
  FAILURE_THRESHOLD: 3,
  COOLDOWN_MS: 60 * 60 * 1000, // 1 hour
};

// Image Processing
export const IMAGE_CONFIG = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_CONTENT_TYPES: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ],
};

/**
 * Configuration for the Jina AI fetch limiter.
 * Limits the number of times the Jina AI Reader service can be called
 * within a rolling time window to prevent excessive usage.
 */
export const JINA_FETCH_CONFIG = {
  MAX_FETCHES_PER_WINDOW: 10, // Max 10 fetches per day
  WINDOW_MS: 24 * 60 * 60 * 1000, // Per 24 hours
};
