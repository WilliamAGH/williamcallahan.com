/**
 * Search Module Constants
 *
 * Internal constants for cache keys, TTLs, and configuration flags.
 *
 * @module lib/search/constants
 * @see {@link @/lib/constants} for S3 paths (SEARCH_S3_PATHS)
 */

/**
 * Cache keys for MiniSearch indexes.
 * Used by ServerCacheInstance to store/retrieve indexes.
 */
export const SEARCH_INDEX_KEYS = {
  INVESTMENTS: "search:index:investments",
  EXPERIENCE: "search:index:experience",
  EDUCATION: "search:index:education",
  BOOKMARKS: "search:index:bookmarks",
  PROJECTS: "search:index:projects",
  BOOKS: "search:index:books",
  BOOKS_DATA: "search:books-data", // Shared cache for full Book[] data
} as const;

/**
 * Cache TTL values for search indexes (in seconds).
 */
export const INDEX_TTL = {
  /** Static content (investments, experience, education, projects) - 1 hour */
  STATIC: 60 * 60,
  /** Bookmarks - 2 hours (S3 indexes are rebuilt on deploy, frequent refresh not needed) */
  BOOKMARKS: 2 * 60 * 60,
  /** Books - 2 hours (slower-changing bookshelf data) */
  BOOKS: 2 * 60 * 60,
  /** Books raw data cache - 2 hours (shared between search index and genre extraction) */
  BOOKS_DATA: 2 * 60 * 60,
} as const;

/**
 * Flag to control whether to load indexes from S3 or build in-memory.
 * Default: true (use S3 indexes for reliability and performance)
 * Set USE_S3_SEARCH_INDEXES=false to force live fetching.
 */
export const USE_S3_INDEXES = process.env.USE_S3_SEARCH_INDEXES !== "false";
