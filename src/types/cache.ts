/**
 * @fileoverview Type definitions for caching structures.
 *
 * @description
 * This file contains TypeScript type definitions related to caching,
 * such as the structure for cached image entries.
 */

import type { GitHubActivityApiResponse } from "./schemas/github-storage";
import type { LogoResult } from "./logo";
import type { ImageDataWithBuffer, ImageSource } from "./image";

/**
 * Image cache entry with buffer
 * Used by ImageMemoryManager for storing actual image data
 */
export interface ImageCacheEntry extends ImageDataWithBuffer {
  // Inherits: buffer, contentType, source, cdnUrl, error, timestamp
  // Override source to be required
  source: ImageSource;
  /** S3 key where the image is stored */
  s3Key?: string;
  /** CDN URL for serving the image (overrides base cdnUrl) */
  cdnUrl?: string;
}

// Simple type alias
export type LogoValidationResult = {
  isGlobeIcon: boolean;
  timestamp: number;
};

// Type alias extending LogoResult
export type LogoFetchResult = LogoResult & {
  domain?: string;
  isValid?: boolean;
  isGlobeIcon?: boolean;
};

/**
 * Callback type for building LogoFetchResult objects.
 * Used in logo discovery to maintain encapsulation while allowing different result builders.
 */
export type LogoResultBuilder = (
  domain: string,
  opts: {
    s3Key: string;
    source: import("./logo").LogoSource;
    contentType: string;
    isValid: boolean;
  },
) => LogoFetchResult;

/**
 * Inverted logo cache entry (metadata only, buffer stored in ImageMemoryManager)
 */
export interface InvertedLogoEntry {
  /** S3 key where the inverted logo is stored */
  s3Key: string;
  /** CDN URL for the inverted logo */
  cdnUrl?: string;
  /** Analysis results */
  analysis: import("./logo").LogoInversion;
  /** Content type of the image */
  contentType: string;
  /** Timestamp when the inversion was created */
  timestamp: number;
}

// Custom structure for GitHub activity cache
export interface GitHubActivityCacheEntry {
  data: GitHubActivityApiResponse;
  lastFetchedAt: number;
  lastAttemptedAt: number;
  timestamp?: number; // Legacy field for backward compatibility
}

// Custom structure for bookmarks cache (doesn't follow standard CacheEntry pattern)
export interface BookmarksCacheEntry {
  bookmarks: import("./schemas/bookmark").UnifiedBookmark[];
  lastFetchedAt: number;
  lastAttemptedAt: number;
}

// Custom structure for search cache
export interface SearchCacheEntry<T> {
  results: T[];
  query: string;
  dataType: string;
  timestamp: number;
}

// Cached bookmark slug mapping with TTL
export interface CachedSlugMapping {
  data: import("./schemas/bookmark").BookmarkSlugMapping;
  timestamp: number;
}

/**
 * Cache statistics interface
 */
export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  ksize: number;
  vsize: number;
  sizeBytes?: number;
  maxSizeBytes?: number;
  utilizationPercent?: number;
}
