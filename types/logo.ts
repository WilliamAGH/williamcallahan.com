/**
 * Logo Data and API Types
 *
 * SCOPE: Defines the data structures for logos throughout their lifecycle,
 * from fetching and analysis, to storage and retrieval. This file should
 * contain ONLY data models and API response types for logos.
 *
 * === INCLUSION RULES ===
 * ✅ DO ADD:
 *   - Logo data models (e.g., LogoData, CompanyData)
 *   - API response types for logo services
 *   - Enums for logo-related states (e.g., LogoSource)
 *
 * === EXCLUSION RULES ===
 * ❌ DO NOT ADD:
 *   - UI component props (→ types/ui/image.ts for LogoImageProps)
 *   - Display options (→ types/ui/image.ts for LogoDisplayOptions)
 *
 * @see types/ui/image.ts for logo component props
 */

// import type { z } from "zod";
// import type { CompanyDataSchema, LogoConfigSchema } from "@/lib/validators/logo";

export interface LogoData {
  url: string;
  source: string | null;
}

/** Identifies the source service used to fetch a company logo. */
export type LogoSource = "google" | "duckduckgo" | "clearbit" | "unknown" | null;

/**
 * Contains analysis results determining if a logo needs color inversion
 * based on theme and image characteristics.
 */
export interface LogoInversion {
  needsDarkInversion: boolean;
  needsLightInversion: boolean;
  hasTransparency: boolean;
  brightness: number;
  format: string;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Results of analyzing a logo's brightness and characteristics
 */
export interface LogoBrightnessAnalysis {
  averageBrightness: number;
  isLightColored: boolean;
  needsInversionInLightTheme: boolean;
  needsInversionInDarkTheme: boolean;
  hasTransparency: boolean;
  format: string;
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Image metadata with validation results
 */
export interface ValidatedLogoMetadata {
  width: number;
  height: number;
  format: string;
  isValid: boolean;
  validationError?: string;
}

/**
 * Contains the fetched logo data along with metadata about the fetch operation.
 * Includes buffer when available for immediate use, otherwise stored separately in ImageMemoryManager
 */
export interface LogoResult {
  /** S3 key where the logo is stored */
  s3Key?: string;
  /** Public URL for the logo (typically CDN) */
  url?: string | null;
  /** CDN URL for the logo */
  cdnUrl?: string;
  /** Source service that provided the logo */
  source: LogoSource;
  /** Where the logo was retrieved from in this request */
  retrieval?: "mem-cache" | "s3-store" | "external" | "placeholder" | "api";
  /** Error message if fetch failed */
  error?: string;
  /** Logo inversion analysis results */
  inversion?: LogoInversion;
  /** MIME type of the logo */
  contentType: string;
  /** Timestamp when fetched */
  timestamp?: number;
  /** Image buffer when available */
  buffer?: Buffer;
}

// Custom structure for logo cache
export interface LogoCacheEntry extends LogoResult {
  timestamp: number;
}

// Simple record type
export type LogoCache = Record<string, LogoCacheEntry>;

/** Logo metadata without buffer - used for caching metadata separately from image data */
export type LogoMetadata = Omit<LogoResult, "buffer">;

/** Structure for the raw API response when fetching logos. */
export interface LogoApiResponse {
  url?: string | null;
  error?: string;
  source?: LogoSource;
  inversion?: LogoInversion;
}

/**
 * Display options for logo components
 * MOVED to types/ui/image.ts
 */
/*
export interface LogoDisplayOptions {
  shouldInvert?: boolean;
  size?: number;
}
*/

/**
 * Props for the logo validation API endpoint
 */
export interface ValidateLogoProps {
  url: string;
  domain: string;
}

/**
 * Configuration options for the logo processing system
 */
// export type LogoConfig = z.infer<typeof LogoConfigSchema>;

/**
 * Represents the data structure for a company, including its logos
 */
// export type CompanyData = z.infer<typeof CompanyDataSchema>;

/**
 * Domain blocklist entry for persistently failed logo fetches
 */
export interface BlockedDomain {
  domain: string;
  failureCount: number;
  lastAttempt: number;
  reason?: string;
}
