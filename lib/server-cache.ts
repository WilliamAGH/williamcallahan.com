/**
 * Server-side Cache Management
 * @module lib/server-cache
 * @description
 * Provides server-side caching for logos, validation results,
 * and image analysis data.
 */

import NodeCache from 'node-cache';
import { timestamp } from './dateTime';
import { SERVER_CACHE_DURATION, LOGO_CACHE_DURATION } from './constants';
import type { LogoInversion, LogoSource } from '../types/logo';

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

/**
 * Server-side cache management class
 * @class ServerCache
 * @extends NodeCache
 */
export class ServerCache extends NodeCache {
  constructor() {
    super({
      stdTTL: SERVER_CACHE_DURATION,
      checkperiod: 24 * 60 * 60, // Check for expired keys every day
      useClones: false, // Don't clone objects for better performance with buffers
      deleteOnExpire: true
    });
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
      timestamp: timestamp()
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
      timestamp: timestamp()
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
      timestamp: timestamp()
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
}

// Export singleton instance
export const ServerCacheInstance = new ServerCache();
