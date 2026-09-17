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
 */
export const SEARCH_INDEX_KEYS = {
  INVESTMENTS: "search:index:investments",
  EXPERIENCE: "search:index:experience",
  EDUCATION: "search:index:education",
  BOOKMARKS: "search:index:bookmarks",
  PROJECTS: "search:index:projects",
  BOOKS: "search:index:books",
  BOOKS_DATA: "search:books-data", // Shared cache for full Book[] data
  AI_ANALYSIS: "search:ai-analysis", // AI-generated analysis content
} as const;

/**
 * Flag to control whether to load persisted indexes or build in-memory.
 * Default: true (use persisted indexes for reliability and performance)
 * Set USE_S3_SEARCH_INDEXES=false to force live fetching.
 */
export const USE_S3_INDEXES = process.env.USE_S3_SEARCH_INDEXES !== "false";
