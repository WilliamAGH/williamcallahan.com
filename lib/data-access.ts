/**
 * Centralized Data Access Layer - Re-exporter
 *
 * This file re-exports functionalities from more specific data access modules.
 * Consumers can import from here for a unified access point, or directly
 * from the specific modules (e.g., '@/lib/data-access/bookmarks') if preferred.
 */

export * from './data-access/bookmarks';
export * from './data-access/logos';
export * from './data-access/investments';
export * from './data-access/github';

// Note: Original shared S3 helper functions (writeJsonFile, readBinaryFile, etc.)
// that were present in this file have been removed.
// Consumers should now directly use the more comprehensive utilities
// provided by '@/lib/s3-utils'.
