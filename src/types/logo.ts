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

import type { BaseMediaResult } from "./image";

// import type { z } from "zod";
// import type { CompanyDataSchema, LogoConfigSchema } from "@/lib/validators/logo";

/** Logo source function type - takes domain string and returns URL string */
type LogoSourceFunction = (domain: string) => string;

/** Standard logo source functions with different sizes */
export interface LogoSourceFunctions {
  readonly hd?: LogoSourceFunction;
  readonly md?: LogoSourceFunction;
  readonly sm?: LogoSourceFunction;
}

/** Direct logo source functions with specific icon types */
export interface DirectLogoSourceFunctions {
  readonly favicon: LogoSourceFunction;
  readonly faviconPng: LogoSourceFunction;
  readonly faviconSvg: LogoSourceFunction;
  readonly appleTouchIcon: LogoSourceFunction;
  readonly appleTouchIconPrecomposed: LogoSourceFunction;
  readonly appleTouchIcon180: LogoSourceFunction;
  readonly appleTouchIcon152: LogoSourceFunction;
  readonly androidChrome192: LogoSourceFunction;
  readonly androidChrome512: LogoSourceFunction;
  readonly favicon32: LogoSourceFunction;
  readonly favicon16: LogoSourceFunction;
}

/** Complete logo sources configuration interface */
export interface LogoSourcesConfig {
  readonly google: LogoSourceFunctions;
  readonly duckduckgo: LogoSourceFunctions;
  readonly clearbit: LogoSourceFunctions;
  readonly direct: DirectLogoSourceFunctions;
}

export interface LogoData {
  url: string;
  source: string | null;
  needsInversion?: boolean;
}

/** Identifies the source service used to fetch a company logo. */
export type LogoSource = "google" | "duckduckgo" | "clearbit" | "direct" | "unknown" | null;

/** Priority configuration entry for logo source selection */
export type LogoSourcePriority = {
  name: LogoSource;
  urlFn: (d: string) => string;
  size: string;
};

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
export interface LogoResult extends BaseMediaResult {
  /** Public URL for the logo (typically original source URL) */
  url?: string | null;
  /** Source service that provided the logo */
  source: LogoSource;
  /** Where the logo was retrieved from in this request */
  retrieval?: "mem-cache" | "s3-store" | "external" | "placeholder" | "api";
  /** Logo inversion analysis results */
  inversion?: LogoInversion;
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

/**
 * Logo debug information for troubleshooting fetch operations
 */
export interface LogoDebugInfo {
  domain: string;
  timestamp: number;
  attempts: {
    type: "hash" | "s3-check" | "external-fetch" | "s3-list";
    details: string;
    result: "success" | "failed";
    error?: string;
  }[];
  s3Results?: {
    totalLogos: number;
    matchingDomains: string[];
    potentialMatches: Array<{
      key: string;
      extractedDomain: string;
      similarity: number;
    }>;
  };
  finalResult: {
    found: boolean;
    source?: string;
    cdnUrl?: string;
    error?: string;
  };
}
