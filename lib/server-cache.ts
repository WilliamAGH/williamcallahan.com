/**
 * Server-side Cache Management
 * @module lib/server-cache
 * @description
 * Provides server-side caching for logos, validation results,
 * and image analysis data.
 */

import NodeCache from 'node-cache';
import { SERVER_CACHE_DURATION } from './constants';
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

// Create a singleton cache instance
const cache = new NodeCache({
  stdTTL: SERVER_CACHE_DURATION,
  checkperiod: 24 * 60 * 60, // Check for expired keys every day
  useClones: false, // Don't clone objects for better performance with buffers
  deleteOnExpire: true
});

/**
 * Server-side cache management
 * @class
 */
export class ServerCache {
  /** Prefix for logo validation cache keys */
  private static readonly LOGO_VALIDATION_PREFIX = 'logo-validation:';
  /** Prefix for logo fetch cache keys */
  private static readonly LOGO_FETCH_PREFIX = 'logo-fetch:';
  /** Prefix for inverted logo cache keys */
  private static readonly INVERTED_LOGO_PREFIX = 'logo-inverted:';
  /** Prefix for logo analysis cache keys */
  private static readonly LOGO_ANALYSIS_PREFIX = 'logo-analysis:';

  /**
   * Get cached logo validation result
   * @param {string} imageHash - Hash of the image to look up
   * @returns {LogoValidationResult | undefined} Cached validation result
   */
  static getLogoValidation(imageHash: string): LogoValidationResult | undefined {
    const key = this.LOGO_VALIDATION_PREFIX + imageHash;
    return cache.get<LogoValidationResult>(key);
  }

  /**
   * Cache logo validation result
   * @param {string} imageHash - Hash of the image to cache
   * @param {boolean} isGlobeIcon - Whether the image is a generic globe icon
   */
  static setLogoValidation(imageHash: string, isGlobeIcon: boolean): void {
    const key = this.LOGO_VALIDATION_PREFIX + imageHash;
    cache.set(key, {
      isGlobeIcon,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached logo fetch result
   * @param {string} domain - Domain to look up
   * @returns {LogoFetchResult | undefined} Cached fetch result
   */
  static getLogoFetch(domain: string): LogoFetchResult | undefined {
    const key = this.LOGO_FETCH_PREFIX + domain;
    return cache.get<LogoFetchResult>(key);
  }

  /**
   * Cache logo fetch result
   * @param {string} domain - Domain to cache
   * @param {Omit<LogoFetchResult, 'timestamp'>} result - Fetch result to cache
   */
  static setLogoFetch(domain: string, result: Omit<LogoFetchResult, 'timestamp'>): void {
    const key = this.LOGO_FETCH_PREFIX + domain;
    cache.set(key, {
      ...result,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached inverted logo
   * @param {string} key - Cache key for the inverted logo
   * @returns {InvertedLogoEntry | undefined} Cached inverted logo
   */
  static getInvertedLogo(key: string): InvertedLogoEntry | undefined {
    const cacheKey = this.INVERTED_LOGO_PREFIX + key;
    return cache.get<InvertedLogoEntry>(cacheKey);
  }

  /**
   * Cache inverted logo
   * @param {string} key - Cache key for the inverted logo
   * @param {Buffer} buffer - Inverted image buffer
   * @param {LogoInversion} analysis - Analysis results
   */
  static setInvertedLogo(key: string, buffer: Buffer, analysis: LogoInversion): void {
    const cacheKey = this.INVERTED_LOGO_PREFIX + key;
    cache.set(cacheKey, {
      buffer,
      analysis,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached logo analysis
   * @param {string} key - Cache key for the analysis
   * @returns {LogoInversion | undefined} Cached analysis results
   */
  static getLogoAnalysis(key: string): LogoInversion | undefined {
    const cacheKey = this.LOGO_ANALYSIS_PREFIX + key;
    return cache.get<LogoInversion>(cacheKey);
  }

  /**
   * Cache logo analysis
   * @param {string} key - Cache key for the analysis
   * @param {LogoInversion} analysis - Analysis results to cache
   */
  static setLogoAnalysis(key: string, analysis: LogoInversion): void {
    const cacheKey = this.LOGO_ANALYSIS_PREFIX + key;
    cache.set(cacheKey, analysis);
  }

  /**
   * Clear all caches
   * @remarks
   * This should only be used for testing or maintenance
   */
  static clear(): void {
    cache.flushAll();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  static getStats() {
    return cache.getStats();
  }

  /**
   * Clear logo fetch cache for a domain
   * @param {string} domain - Domain to clear cache for
   */
  static clearLogoFetch(domain: string): void {
    const key = this.LOGO_FETCH_PREFIX + domain;
    cache.del(key);
  }

  /**
   * Clear all logo fetch caches
   */
  static clearAllLogoFetches(): void {
    const keys = cache.keys();
    keys.forEach(key => {
      if (key.startsWith(this.LOGO_FETCH_PREFIX)) {
        cache.del(key);
      }
    });
  }
}
