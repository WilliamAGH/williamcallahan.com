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
export interface ValidatedMetadata {
  width: number;
  height: number;
  format: string;
  isValid: boolean;
  validationError?: string;
}

/**
 * Contains the fetched logo data along with metadata about the fetch operation.
 */
export interface LogoResult {
  url: string | null;
  source: LogoSource;
  retrieval?: "mem-cache" | "s3-store" | "external" | "placeholder";
  error?: string;
  inversion?: LogoInversion;
  buffer?: Buffer;
  contentType: string;
}

/**
 * Represents a cached logo entry, extending `LogoResult` with a timestamp
 * for cache management.
 */
export interface LogoCacheEntry extends LogoResult {
  timestamp: number;
}

/**
 * Defines the structure for the logo cache, mapping domain names
 * to their `LogoCacheEntry`.
 */
export interface LogoCache {
  [domain: string]: LogoCacheEntry;
}

/** Structure for the raw API response when fetching logos. */
export interface LogoApiResponse {
  url?: string | null;
  error?: string;
  source?: LogoSource;
  inversion?: LogoInversion;
}

/** Defines the logo data structure passed from server to client components. */
export interface LogoData {
  url: string;
  source: string | null;
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
