/**
 * @fileoverview Type definitions for caching structures.
 *
 * @description
 * This file contains TypeScript type definitions related to caching,
 * such as the structure for cached image entries.
 */

import type { LRUCache } from "lru-cache";
import type { GitHubActivityApiResponse } from "./github";
import type { LogoResult } from "./logo";
import type { OgResult } from "./opengraph";
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
 * Extends LogoResult with additional server-side metadata
 */
export interface LogoFetchResult extends LogoResult {
  /** Domain the logo is for */
  domain?: string;
  /** Whether the logo is valid */
  isValid?: boolean;
  /** Whether the logo is a generic globe icon */
  isGlobeIcon?: boolean;
}

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
export interface ICache {
  get<T>(key: string): T | undefined;
  set<T extends CacheValue>(key: string, value: T, ttl?: number): boolean;
  del(key: string | string[]): void;
  keys(): string[];
  has(key: string): boolean;
  getStats(): CacheStats;
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

/**
 * Cache statistics interface
 */
export interface CacheStats {
  keys: number;
  hits: number;
  misses: number;
  ksize: number;
  vsize: number;
}

/**
 * Type for LRU cache storing buffers
 */
export type BufferCache = LRUCache<string, Buffer, unknown>;

/**
 * Type for LRU cache storing metadata
 */
export type MetadataCache = LRUCache<string, Omit<ImageCacheEntry, "buffer">, unknown>;

/**
 * Types that can be safely stored in LRUCache (excludes null/undefined)
 * These satisfy LRUCache's constraint that values must extend {}
 * Using 'object' instead of Record<string, unknown> to allow any object type
 */
export type StorableCacheValue = string | number | boolean | object | Buffer;

/**
 * The full cache value type for the public interface (includes null)
 * null values are handled by not storing them (returning undefined instead)
 */
export type CacheValue = StorableCacheValue | null;
