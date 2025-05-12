/**
 * Server-side Cache Management
 * @module lib/server-cache
 * @description
 * Provides server-side caching for logos, validation results,
 * image analysis data, and bookmarks.
 */

import NodeCache from 'node-cache';
import { SERVER_CACHE_DURATION, LOGO_CACHE_DURATION, BOOKMARKS_CACHE_DURATION, GITHUB_ACTIVITY_CACHE_DURATION } from './constants'; // Added GITHUB_ACTIVITY_CACHE_DURATION
import type { LogoInversion, LogoSource } from '../types/logo';
import type { UnifiedBookmark } from '../types/bookmark';
import type { GitHubActivityApiResponse } from '../types/github';
import { assertServerOnly } from './utils/ensure-server-only';

assertServerOnly();

/**
 * Logo validation result from the server
 * @interface
 */
interface LogoValidationResult {
  /** Whether the image is a generic globe icon */
  isGlobeIcon: boolean;
  /** Timestamp when the validation was performed */
  timestamp: number;
}

/**
 * Logo fetch result from the server
 * @interface
 */
interface LogoFetchResult {
  /** URL of the logo, or null if no valid logo found */
  url: string | null;
  /** Source of the logo (google, duckduckgo, or null) */
  source: LogoSource;
  /** Raw image buffer */
  buffer?: Buffer;
  /** Error message if logo fetch failed */
  error?: string;
  /** Timestamp when the logo was fetched */
  timestamp: number;
}

/**
 * Inverted logo cache entry
 * @interface
 */
interface InvertedLogoEntry {
  /** Inverted image buffer */
  buffer: Buffer;
  /** Analysis results */
  analysis: LogoInversion;
  /** Timestamp when the inversion was created */
  timestamp: number;
}

// Cache key prefixes
const LOGO_VALIDATION_PREFIX = 'logo-validation:';
const LOGO_FETCH_PREFIX = 'logo-fetch:';
const INVERTED_LOGO_PREFIX = 'logo-inverted:';
const LOGO_ANALYSIS_PREFIX = 'logo-analysis:';
const BOOKMARKS_CACHE_KEY = 'bookmarks-data';
const GITHUB_ACTIVITY_CACHE_KEY = 'github-activity-data'; // Added GitHub activity cache key

/**
 * GitHub Activity cache entry
 * @interface
 */
interface GitHubActivityCacheEntry extends GitHubActivityApiResponse {
  /** Timestamp when the cache entry was created */
  timestamp: number;
  /** Last successful API fetch timestamp */
  lastFetchedAt: number;
  /** Last fetch attempt timestamp */
  lastAttemptedAt: number;
}

/**
 * Bookmarks cache entry
 * @interface
 */
interface BookmarksCacheEntry {
  /** Bookmarks data */
  bookmarks: UnifiedBookmark[];
  /** Last successful API fetch timestamp */
  lastFetchedAt: number;
  /** Last fetch attempt timestamp */
  lastAttemptedAt: number;
}

export class ServerCache extends NodeCache {
  constructor() {
    super({
      stdTTL: SERVER_CACHE_DURATION,
      checkperiod: 24 * 60 * 60, // Check for expired keys every day
      useClones: false, // Don't clone objects for better performance with buffers
      deleteOnExpire: true
    });
    // The complex binding loop has been removed.
    // Methods will rely on standard prototype inheritance.
    // The original loop was intended to handle cases where the NodeCache
    // constructor might replace `this`. If MockNodeCache (and the current
    // version of NodeCache) don't do this, the loop might be unnecessary
    // or problematic in a mocked environment.
  }

  /**
   * Get cached logo validation result
   * @param {string} imageHash - Hash of the image to look up
   * @returns {LogoValidationResult | undefined} Cached validation result
   */
  getLogoValidation(imageHash: string): LogoValidationResult | undefined {
    const key = LOGO_VALIDATION_PREFIX + imageHash;
    return this.get<LogoValidationResult>(key);
  }

  /**
   * Cache logo validation result
   * @param {string} imageHash - Hash of the image to cache
   * @param {boolean} isGlobeIcon - Whether the image is a generic globe icon
   */
  setLogoValidation(imageHash: string, isGlobeIcon: boolean): void {
    const key = LOGO_VALIDATION_PREFIX + imageHash;
    this.set(key, {
      isGlobeIcon,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached logo fetch result
   * @param {string} domain - Domain to look up
   * @returns {LogoFetchResult | undefined} Cached fetch result
   */
  getLogoFetch(domain: string): LogoFetchResult | undefined {
    const key = LOGO_FETCH_PREFIX + domain;
    return this.get<LogoFetchResult>(key);
  }

  /**
   * Cache logo fetch result
   * @param {string} domain - Domain to cache
   * @param {Partial<LogoFetchResult>} result - Fetch result to cache
   */
  setLogoFetch(domain: string, result: Partial<LogoFetchResult>): void {
    const key = LOGO_FETCH_PREFIX + domain;
    this.set(key, {
      ...result,
      timestamp: Date.now()
    }, result.error ? LOGO_CACHE_DURATION.FAILURE : LOGO_CACHE_DURATION.SUCCESS);
  }

  /**
   * Clear logo fetch result
   * @param {string} domain - Domain to clear
   */
  clearLogoFetch(domain: string): void {
    const key = LOGO_FETCH_PREFIX + domain;
    this.del(key);
  }

  /**
   * Clear all logo fetch results
   */
  clearAllLogoFetches(): void {
    const keys = this.keys().filter(key => key.startsWith(LOGO_FETCH_PREFIX));
    keys.forEach(key => this.del(key));
  }

  /**
   * Get cached inverted logo
   * @param {string} cacheKey - Cache key for the inverted logo
   * @returns {InvertedLogoEntry | undefined} Cached inverted logo
   */
  getInvertedLogo(cacheKey: string): InvertedLogoEntry | undefined {
    const key = INVERTED_LOGO_PREFIX + cacheKey;
    return this.get<InvertedLogoEntry>(key);
  }

  /**
   * Cache inverted logo
   * @param {string} cacheKey - Cache key for the inverted logo
   * @param {Buffer} buffer - Inverted image buffer
   * @param {LogoInversion} analysis - Analysis results
   */
  setInvertedLogo(cacheKey: string, buffer: Buffer, analysis: LogoInversion): void {
    const key = INVERTED_LOGO_PREFIX + cacheKey;
    this.set(key, {
      buffer,
      analysis,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached logo analysis
   * @param {string} cacheKey - Cache key for the logo analysis
   * @returns {LogoInversion | undefined} Cached analysis results
   */
  getLogoAnalysis(cacheKey: string): LogoInversion | undefined {
    const key = LOGO_ANALYSIS_PREFIX + cacheKey;
    return this.get<LogoInversion>(key);
  }

  /**
   * Cache logo analysis
   * @param {string} cacheKey - Cache key for the logo analysis
   * @param {LogoInversion} analysis - Analysis results to cache
   */
  setLogoAnalysis(cacheKey: string, analysis: LogoInversion): void {
    const key = LOGO_ANALYSIS_PREFIX + cacheKey;
    this.set(key, analysis);
  }

  /**
   * Get cache statistics
   * @returns {NodeCache.Stats} Cache statistics
   */
  getStats(): NodeCache.Stats {
    const stats = super.getStats();
    return {
      hits: stats.hits,
      misses: stats.misses,
      keys: this.keys().length,
      ksize: stats.ksize,
      vsize: stats.vsize
    };
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.flushAll();
  }

  /**
   * Clear all caches
   */
  clear(): void {
    super.flushAll();
  }

  /**
   * Get cached bookmarks
   * @returns {BookmarksCacheEntry | undefined} Cached bookmarks
   */
  getBookmarks(): BookmarksCacheEntry | undefined {
    return this.get<BookmarksCacheEntry>(BOOKMARKS_CACHE_KEY);
  }

  /**
   * Cache bookmarks
   * @param {UnifiedBookmark[]} bookmarks - Bookmarks to cache
   * @param {boolean} isFailure - Whether this was a failed fetch attempt
   */
  setBookmarks(bookmarks: UnifiedBookmark[], isFailure: boolean = false): void {
    const now = Date.now();
    const existing = this.getBookmarks();

    const entry: BookmarksCacheEntry = {
      bookmarks: isFailure ? (existing?.bookmarks || []) : bookmarks,
      // Preserve the last successful fetch time on failures to prevent re-fetch loops
      lastFetchedAt: isFailure ? (existing?.lastFetchedAt ?? now) : now,
      lastAttemptedAt: now
    };

    this.set(
      BOOKMARKS_CACHE_KEY,
      entry,
      isFailure ? BOOKMARKS_CACHE_DURATION.FAILURE : BOOKMARKS_CACHE_DURATION.SUCCESS
    );
  }

  /**
   * Check if bookmarks cache needs refreshing
   * @returns {boolean} True if cache should be refreshed
   */
  shouldRefreshBookmarks(): boolean {
    const cached = this.getBookmarks();
    if (!cached) {
      console.log('shouldRefreshBookmarks: No cache entry, refresh required');
      return true;
    }

    // Verify the cached bookmarks are valid
    if (!cached.bookmarks || !Array.isArray(cached.bookmarks) || cached.bookmarks.length === 0) {
      console.log('shouldRefreshBookmarks: Empty or invalid cache, refresh required');
      return true;
    }

    const now = Date.now();
    const timeSinceLastFetch = now - cached.lastFetchedAt;
    const shouldRefresh = timeSinceLastFetch > BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;

    if (shouldRefresh) {
      console.log(`shouldRefreshBookmarks: Cache expired (${timeSinceLastFetch}ms old), refresh required`);
    } else {
      console.log(`shouldRefreshBookmarks: Cache still valid (${timeSinceLastFetch}ms old), using cached data`);
    }

    return shouldRefresh;
  }

  /**
   * Clear bookmarks cache
   */
  clearBookmarks(): void {
    this.del(BOOKMARKS_CACHE_KEY);
  }

  /**
   * Get cached GitHub activity
   * @returns {GitHubActivityCacheEntry | undefined} Cached GitHub activity
   */
  getGithubActivity(): GitHubActivityCacheEntry | undefined {
    const key = GITHUB_ACTIVITY_CACHE_KEY;
    return this.get<GitHubActivityCacheEntry>(key);
  }

  /**
   * Cache GitHub activity
   * @param {GitHubActivityApiResponse} activityData - GitHub activity data to cache
   * @param {boolean} isFailure - Whether this was a failed fetch attempt
   */
  setGithubActivity(activityData: GitHubActivityApiResponse, isFailure: boolean = false): void {
    const key = GITHUB_ACTIVITY_CACHE_KEY;
    const payload: GitHubActivityCacheEntry = {
      ...activityData,
      timestamp: Date.now(),
      lastFetchedAt: isFailure ? (this.getGithubActivity()?.lastFetchedAt ?? Date.now()) : Date.now(),
      lastAttemptedAt: Date.now(),
    };

    this.set(
      key,
      payload,
      isFailure || !activityData.trailingYearData.dataComplete
        ? GITHUB_ACTIVITY_CACHE_DURATION.FAILURE
        : GITHUB_ACTIVITY_CACHE_DURATION.SUCCESS
    );
  }

  /**
   * Clear GitHub activity cache
   */
  clearGithubActivity(): void {
    this.del(GITHUB_ACTIVITY_CACHE_KEY);
  }
}

export const ServerCacheInstance = new ServerCache();
