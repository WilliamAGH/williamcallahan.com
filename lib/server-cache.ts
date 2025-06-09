/**
 * Server-side Cache Management
 *
 * Provides server-side in-memory caching for application data
 * Handles logos, validation results, image analysis, bookmarks, and GitHub activity
 * Implements a singleton pattern with configurable TTL per data type
 *
 * @module lib/server-cache
 */

import NodeCache from 'node-cache';
import { SERVER_CACHE_DURATION, LOGO_CACHE_DURATION, BOOKMARKS_CACHE_DURATION, GITHUB_ACTIVITY_CACHE_DURATION, OPENGRAPH_CACHE_DURATION } from './constants';
import type { LogoInversion, LogoSource } from '../types/logo';
import type { UnifiedBookmark } from '../types/bookmark';
import type { GitHubActivityApiResponse } from '../types/github';
import type { OgCacheEntry, OgResult } from '../types';
import { assertServerOnly } from './utils/ensure-server-only';

assertServerOnly();

/**
 * Logo validation result from the server
 */
interface LogoValidationResult {
  /** Whether the image is a generic globe icon */
  isGlobeIcon: boolean;
  /** Timestamp when the validation was performed */
  timestamp: number;
}

/**
 * Logo fetch result from the server
 */
interface LogoFetchResult {
  /** URL of the logo, or null if no valid logo found */
  url: string | null;
  /** Source of the logo (google, duckduckgo, or null) */
  source: LogoSource;
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
const OPENGRAPH_PREFIX = 'og-data:';
const BOOKMARKS_CACHE_KEY = 'bookmarks-data';
const GITHUB_ACTIVITY_CACHE_KEY = 'github-activity-data';

/**
 * GitHub Activity cache entry
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
   * 
   * @param imageHash - Hash of the image to look up
   * @returns Cached validation result
   */
  getLogoValidation(imageHash: string): LogoValidationResult | undefined {
    const key = LOGO_VALIDATION_PREFIX + imageHash;
    return this.get<LogoValidationResult>(key);
  }

  /**
   * Cache logo validation result
   * 
   * @param imageHash - Hash of the image to cache
   * @param isGlobeIcon - Whether the image is a generic globe icon
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
   * 
   * @param domain - Domain to look up
   * @returns Cached fetch result
   */
  getLogoFetch(domain: string): LogoFetchResult | undefined {
    const key = LOGO_FETCH_PREFIX + domain;
    return this.get<LogoFetchResult>(key);
  }

  /**
   * Cache logo fetch result
   * 
   * @param domain - Domain to cache
   * @param result - Fetch result to cache
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
    for (const key of keys) {
      this.del(key);
    }
  }

  /**
   * Get cached inverted logo
   * 
   * @param cacheKey - Cache key for the inverted logo
   * @returns Cached inverted logo
   */
  getInvertedLogo(cacheKey: string): InvertedLogoEntry | undefined {
    const key = INVERTED_LOGO_PREFIX + cacheKey;
    return this.get<InvertedLogoEntry>(key);
  }

  /**
   * Cache inverted logo
   * 
   * @param cacheKey - Cache key for the inverted logo
   * @param buffer - Inverted image buffer
   * @param analysis - Analysis results
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
   * 
   * @param cacheKey - Cache key for the logo analysis
   * @returns Cached analysis results
   */
  getLogoAnalysis(cacheKey: string): LogoInversion | undefined {
    const key = LOGO_ANALYSIS_PREFIX + cacheKey;
    return this.get<LogoInversion>(key);
  }

  /**
   * Cache logo analysis
   * 
   * @param cacheKey - Cache key for the logo analysis
   * @param analysis - Analysis results to cache
   */
  setLogoAnalysis(cacheKey: string, analysis: LogoInversion): void {
    const key = LOGO_ANALYSIS_PREFIX + cacheKey;
    this.set(key, analysis);
  }

  /**
   * Get cache statistics
   * 
   * @returns Cache statistics
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
   * 
   * @returns Cached bookmarks
   */
  getBookmarks(): BookmarksCacheEntry | undefined {
    return this.get<BookmarksCacheEntry>(BOOKMARKS_CACHE_KEY);
  }

  /**
   * Cache bookmarks
   * 
   * @param bookmarks - Bookmarks to cache
   * @param isFailure - Whether this was a failed fetch attempt
   */
  setBookmarks(bookmarks: UnifiedBookmark[], isFailure = false): void {
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
   * 
   * @returns True if cache should be refreshed
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
    const revalidationThreshold = BOOKMARKS_CACHE_DURATION.REVALIDATION * 1000;
    console.log(`[ServerCache] shouldRefreshBookmarks: cache age = ${timeSinceLastFetch}ms; threshold = ${revalidationThreshold}ms`);
    const shouldRefresh = timeSinceLastFetch > revalidationThreshold;

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
   * 
   * @returns Cached GitHub activity
   */
  getGithubActivity(): GitHubActivityCacheEntry | undefined {
    const key = GITHUB_ACTIVITY_CACHE_KEY;
    return this.get<GitHubActivityCacheEntry>(key);
  }

  /**
   * Cache GitHub activity
   * 
   * @param activityData - GitHub activity data to cache
   * @param isFailure - Whether this was a failed fetch attempt
   */
  setGithubActivity(activityData: GitHubActivityApiResponse, isFailure = false): void {
    const key = GITHUB_ACTIVITY_CACHE_KEY;

    // Ensure trailingYearData and dataComplete exist before accessing
    // and default to false if not present (treating incomplete/missing data as a "failure" for caching duration)
    const isDataComplete = activityData?.trailingYearData?.dataComplete === true;

    const payload: GitHubActivityCacheEntry = {
      ...activityData,
      timestamp: Date.now(),
      lastFetchedAt: isFailure ? (this.getGithubActivity()?.lastFetchedAt ?? Date.now()) : Date.now(),
      lastAttemptedAt: Date.now(),
    };

    const ttl = (isFailure || !isDataComplete)
      ? GITHUB_ACTIVITY_CACHE_DURATION.FAILURE
      : GITHUB_ACTIVITY_CACHE_DURATION.SUCCESS;

    const success = this.set(
      key,
      payload,
      ttl
    );

    if (!success) {
      // It's good practice to log if the cache set operation fails,
      // as NodeCache.set can return false.
      console.warn(`[ServerCache] Failed to set cache for key: ${key}. TTL was: ${ttl} seconds. Data was: ${JSON.stringify(payload).substring(0, 200)}...`);
    }
  }

  /**
   * Clear GitHub activity cache
   */
  clearGithubActivity(): void {
    this.del(GITHUB_ACTIVITY_CACHE_KEY);
  }

  /**
   * Get cached OpenGraph data
   * 
   * @param url - URL to look up
   * @returns Cached OpenGraph data
   */
  getOpenGraphData(url: string): OgCacheEntry | undefined {
    const key = OPENGRAPH_PREFIX + url;
    return this.get<OgCacheEntry>(key);
  }

  /**
   * Cache OpenGraph data
   * 
   * @param url - URL to cache
   * @param data - OpenGraph data to cache
   * @param isFailure - Whether this was a failed fetch attempt
   */
  setOpenGraphData(url: string, data: OgResult, isFailure = false): void {
    const key = OPENGRAPH_PREFIX + url;
    const now = Date.now();
    const existing = this.getOpenGraphData(url);

    const entry: OgCacheEntry = {
      ...data,
      lastFetchedAt: isFailure ? (existing?.lastFetchedAt ?? now) : now,
      lastAttemptedAt: now,
      isFailure
    };

    this.set(
      key,
      entry,
      isFailure ? OPENGRAPH_CACHE_DURATION.FAILURE : OPENGRAPH_CACHE_DURATION.SUCCESS
    );
  }

  /**
   * Check if OpenGraph cache needs refreshing
   * 
   * @param url - URL to check
   * @returns True if cache should be refreshed
   */
  shouldRefreshOpenGraph(url: string): boolean {
    const cached = this.getOpenGraphData(url);
    if (!cached) {
      return true;
    }

    // Don't refresh if it's a recent failure
    if (cached.isFailure) {
      const timeSinceLastAttempt = Date.now() - cached.lastAttemptedAt;
      return timeSinceLastAttempt > OPENGRAPH_CACHE_DURATION.FAILURE * 1000;
    }

    // Check if data is stale
    const timeSinceLastFetch = Date.now() - cached.lastFetchedAt;
    return timeSinceLastFetch > OPENGRAPH_CACHE_DURATION.REVALIDATION * 1000;
  }

  /**
   * Clear OpenGraph data cache
   * 
   * @param url - URL to clear (optional, clears all if not provided)
   */
  clearOpenGraphData(url?: string): void {
    if (url) {
      const key = OPENGRAPH_PREFIX + url;
      this.del(key);
    } else {
      const keys = this.keys().filter(key => key.startsWith(OPENGRAPH_PREFIX));
      for (const key of keys) {
        this.del(key);
      }
    }
  }
}

export const ServerCacheInstance = new ServerCache();
