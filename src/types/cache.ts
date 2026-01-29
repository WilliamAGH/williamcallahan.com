/**
 * @fileoverview Type definitions for caching structures.
 *
 * @description
 * This file contains TypeScript type definitions related to caching,
 * such as the structure for cached image entries.
 */

import type { GitHubActivityApiResponse } from "./github";
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

/**
 * Defines the core methods of a cache that domain-specific helpers can rely on.
 * This allows splitting the ServerCache class logic into multiple files
 * while maintaining type safety for the `this` context in the helper methods.
 */
export interface Cache {
  get<T>(key: string): T | undefined;
  set<T extends CacheValue>(key: string, value: T, ttl?: number): boolean;
  del(key: string | string[]): void;
  keys(): string[];
  has(key: string): boolean;
  getStats(): CacheStats;
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
  bookmarks: import("./bookmark").UnifiedBookmark[];
  lastFetchedAt: number;
  lastAttemptedAt: number;
}

// Custom structure for search cache
export interface SearchCacheEntry<T = unknown> {
  results: T[];
  query: string;
  dataType: string;
  timestamp: number;
}

// Cached bookmark slug mapping with TTL
export interface CachedSlugMapping {
  data: import("./bookmark").BookmarkSlugMapping;
  timestamp: number;
}

// OgCacheEntry removed - use import from types/opengraph.ts instead
// import type { OgCacheEntry } from "./opengraph";

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

/**
 * Types that can be safely stored in cache (excludes null/undefined)
 * These satisfy the constraint that values must extend {}
 * Using 'object' instead of Record<string, unknown> to allow any object type
 */
export type StorableCacheValue = string | number | boolean | object | Buffer;

/**
 * The full cache value type for the public interface (includes null)
 * null values are handled by not storing them (returning undefined instead)
 */
export type CacheValue = StorableCacheValue | null;

/**
 * Internal cache entry structure for ServerCache
 * Used for the Map-based implementation
 */
export interface ServerCacheMapEntry<T = StorableCacheValue> {
  value: T;
  expiresAt: number;
  size: number;
}
