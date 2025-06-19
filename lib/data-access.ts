/**
 * Data access layer re-exports - unified import point
 *
 * Re-exports: bookmarks, logos, investments, github
 * Usage: import { getLogo, getBookmarks } from '@/lib/data-access'
 *
 * @module lib/data-access
 */

export * from "./bookmarks/bookmarks-data-access.server";
export * from "./data-access/logos";
export * from "./data-access/investments";
export * from "./data-access/github";

// Note: Original shared S3 helper functions (writeJsonFile, readBinaryFile, etc.)
// that were present in this file have been removed.
// Consumers should now directly use the more comprehensive utilities
// provided by '@/lib/s3-utils'.
