/**
 * Logo Types Module
 * Defines TypeScript interfaces for the logo management system
 *
 * @module types/logo
 */

/**
 * Represents the result of a logo fetch operation
 * Contains the URL of the fetched logo and metadata about its source
 */
export interface LogoResult {
  /** The URL of the fetched logo image */
  url: string;
  /** The source service that provided the logo */
  source: "google" | "duckduckgo" | "fallback";
  /** Optional error message if something went wrong but a fallback was provided */
  error?: string;
}

/**
 * Represents the structure of the logo cache
 * Maps domain names to cached logo information
 *
 * @example
 * {
 *   "google.com": {
 *     url: "https://...",
 *     timestamp: 1234567890
 *   }
 * }
 */
export interface LogoCache {
  /** Domain-keyed map of cached logo data */
  [domain: string]: {
    /** The cached logo URL */
    url: string;
    /** Timestamp when the logo was cached (milliseconds since epoch) */
    timestamp: number;
  };
}

/**
 * Re-export education types for convenience
 * These are used in conjunction with logo handling in education-related components
 */
export type { Education, Certification } from "./education";
