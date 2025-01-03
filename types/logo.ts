/**
 * Logo Types Module
 * @module types/logo
 * @description Type definitions for logo fetching, caching, and display functionality.
 * This module contains all type definitions used across the logo handling system,
 * including fetching, analysis, caching, and display components.
 * @since 1.0.0
 */

/**
 * Supported sources for logo fetching
 * @description Identifies the source service used to fetch a company logo
 * @example
 * ```typescript
 * const source: LogoSource = 'google';
 * ```
 */
export type LogoSource = 'google' | 'duckduckgo' | null;

/**
 * Analysis results for logo color inversion needs
 * @description Contains analysis results determining when a logo needs color inversion
 * based on theme and image characteristics
 * @interface
 * @see {@link LogoResult}
 * @see {@link LogoDisplayOptions}
 * @example
 * ```typescript
 * const analysis: LogoInversion = {
 *   needsDarkInversion: true,
 *   needsLightInversion: false,
 *   hasTransparency: true,
 *   brightness: 240
 * };
 * ```
 */
export interface LogoInversion {
  /** Whether the logo needs inversion on dark theme */
  needsDarkInversion: boolean;
  /** Whether the logo needs inversion on light theme */
  needsLightInversion: boolean;
  /** Whether the logo has transparency */
  hasTransparency: boolean;
  /** Average brightness value (0-255) */
  brightness: number;
}

/**
 * Result of a logo fetch operation
 * @description Contains the fetched logo data along with metadata about the fetch operation
 * @interface
 * @see {@link LogoInversion}
 * @see {@link LogoCacheEntry}
 * @example
 * ```typescript
 * const result: LogoResult = {
 *   url: 'https://example.com/logo.png',
 *   source: 'google',
 *   inversion: {
 *     needsDarkInversion: true,
 *     needsLightInversion: false,
 *     hasTransparency: true,
 *     brightness: 240
 *   }
 * };
 * ```
 */
export interface LogoResult {
  /** URL of the logo, or null if no valid logo found */
  url: string | null;
  /** Source of the logo */
  source: LogoSource;
  /** Error message if logo fetch failed */
  error?: string;
  /** Inversion analysis results */
  inversion?: LogoInversion;
  /** Raw image buffer */
  buffer?: Buffer;
}

/**
 * Cache entry for a fetched logo
 * @description Extends LogoResult with timestamp information for cache management
 * @interface
 * @extends {LogoResult}
 * @see {@link LogoCache}
 * @example
 * ```typescript
 * const cacheEntry: LogoCacheEntry = {
 *   url: 'https://example.com/logo.png',
 *   source: 'google',
 *   timestamp: Date.now(),
 *   inversion: {
 *     needsDarkInversion: true,
 *     needsLightInversion: false,
 *     hasTransparency: true,
 *     brightness: 240
 *   }
 * };
 * ```
 */
export interface LogoCacheEntry extends LogoResult {
  /** Timestamp when the cache entry was created */
  timestamp: number;
}

/**
 * Structure for the logo cache
 * @description Maps domain names to their corresponding cached logo entries
 * @interface
 * @see {@link LogoCacheEntry}
 * @example
 * ```typescript
 * const cache: LogoCache = {
 *   'example.com': {
 *     url: 'https://example.com/logo.png',
 *     source: 'google',
 *     timestamp: Date.now(),
 *     inversion: {
 *       needsDarkInversion: true,
 *       needsLightInversion: false,
 *       hasTransparency: true,
 *       brightness: 240
 *     }
 *   }
 * };
 * ```
 */
export interface LogoCache {
  [domain: string]: LogoCacheEntry;
}

/**
 * Configuration options for logo display
 * @description Controls how a logo is displayed, including theme-based inversion
 * and fallback behavior
 * @interface
 * @see {@link LogoInversion}
 * @example
 * ```typescript
 * const options: LogoDisplayOptions = {
 *   enableInversion: true,
 *   isDarkTheme: true,
 *   className: 'company-logo',
 *   alt: 'Company Logo',
 *   showPlaceholder: true
 * };
 * ```
 */
export interface LogoDisplayOptions {
  /**
   * Whether to enable automatic logo inversion based on theme
   * @default false
   */
  enableInversion?: boolean;

  /**
   * Whether the current theme is dark mode
   * @default false
   */
  isDarkTheme?: boolean;

  /**
   * CSS classes to apply to the logo image element
   * @default ''
   */
  className?: string;

  /**
   * Accessible alt text for the logo image
   * @default 'Company Logo'
   */
  alt?: string;

  /**
   * Whether to show a placeholder image when logo loading fails
   * @default true
   */
  showPlaceholder?: boolean;
}
