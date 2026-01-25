/**
 * Data access layer re-exports - unified import point
 *
 * Re-exports: logos, investments, github
 * Usage: import { getLogo } from '@/lib/data-access'
 *
 * Note: Bookmarks should be imported directly from '@/lib/bookmarks/bookmarks-data-access.server'
 *
 * @module lib/data-access
 */

export * from "./data-access/index";

// Note: Original shared S3 helper functions (writeJsonFile, readBinaryFile, etc.)
// that were present in this file have been removed.
// Consumers should now directly use the more comprehensive utilities
// provided by '@/lib/s3-utils'.
