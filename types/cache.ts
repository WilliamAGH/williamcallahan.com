/**
 * @fileoverview Type definitions for caching structures.
 *
 * @description
 * This file contains TypeScript type definitions related to caching,
 * such as the structure for cached image entries.
 */

import type { GitHubActivityApiResponse } from "./github";
import type { OgResult } from "./opengraph";

export interface ImageCacheEntry {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}

/**
 * Logo validation result from the server
 */
export interface LogoValidationResult {
  /** Whether the image is a generic globe icon */
  isGlobeIcon: boolean;
  /** Timestamp when the validation was performed */
  timestamp: number;
}

/**
 * Logo fetch result from the server
 */
export interface LogoFetchResult {
  /** URL of the logo, or null if no valid logo found */
  url: string | null;
  /** Source of the logo (google, duckduckgo, or null) */
  source: import("./logo").LogoSource;
  /** Raw image buffer */
  buffer?: Buffer;
  /** Content type of the image (e.g., 'image/png', 'image/svg+xml') */
  contentType?: string;
  /** Error message if logo fetch failed */
  error?: string;
  /** Timestamp when the logo was fetched */
  timestamp: number;
}

/**
 * Inverted logo cache entry
 */
export interface InvertedLogoEntry {
  /** Inverted image buffer */
  buffer: Buffer;
  /** Analysis results */
  analysis: import("./logo").LogoInversion;
  /** Timestamp when the inversion was created */
  timestamp: number;
}

/**
 * GitHub Activity cache entry
 */
export interface GitHubActivityCacheEntry extends GitHubActivityApiResponse {
  /** Timestamp when the cache entry was created */
  timestamp: number;
  /** Last successful API fetch timestamp */
  lastFetchedAt: number;
  /** Last fetch attempt timestamp */
  lastAttemptedAt: number;
}

/**
 * Bookmarks cache entry
 */
export interface BookmarksCacheEntry {
  /** Bookmarks data */
  bookmarks: import("./bookmark").UnifiedBookmark[];
  /** Last successful API fetch timestamp */
  lastFetchedAt: number;
  /** Last fetch attempt timestamp */
  lastAttemptedAt: number;
}

/**
 * Search results cache entry
 */
export interface SearchCacheEntry<T = unknown> {
  /** Search results */
  results: T[];
  /** Search query that generated these results */
  query: string;
  /** Data type being searched (posts, bookmarks, etc.) */
  dataType: string;
  /** Timestamp when the cache entry was created */
  timestamp: number;
}

/**
 * OpenGraph cache entry
 */
export interface OgCacheEntry extends OgResult {
  lastFetchedAt: number;
  lastAttemptedAt: number;
  isFailure?: boolean;
}
