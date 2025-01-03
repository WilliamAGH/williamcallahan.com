/**
 * Logo Types Module
 * @module types/logo
 * @description
 * Type definitions for logo fetching, caching, and display.
 */

/**
 * Logo source identifiers
 */
export type LogoSource = 'google' | 'duckduckgo' | null;

/**
 * Logo inversion analysis
 * @interface
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
 * Logo fetch result
 * @interface
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
 * Logo cache entry
 * @interface
 */
export interface LogoCacheEntry extends LogoResult {
  /** Timestamp when the cache entry was created */
  timestamp: number;
}

/**
 * Logo cache structure
 * @interface
 */
export interface LogoCache {
  [domain: string]: LogoCacheEntry;
}

/**
 * Logo display options
 * @interface
 */
export interface LogoDisplayOptions {
  /** Whether to invert the logo based on theme */
  enableInversion?: boolean;
  /** Whether the current theme is dark */
  isDarkTheme?: boolean;
  /** CSS classes to apply */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Whether to show placeholder on error */
  showPlaceholder?: boolean;
}
