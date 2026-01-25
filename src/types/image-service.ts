/**
 * Types for unified image service modules
 */

import type { LogoSource, LogoInversion } from "@/types/logo";

/**
 * Entry in the upload retry queue for failed S3 uploads
 */
export interface RetryEntry {
  sourceUrl: string;
  contentType: string;
  attempts: number;
  lastAttempt: number;
  nextRetry: number;
}

/**
 * Context for logo fetch operations passed between modules
 */
export interface LogoFetchContext {
  domain: string;
  source: LogoSource;
  url?: string | null;
  extension?: string;
  inverted?: boolean;
}

/**
 * Result from external logo fetch attempt
 */
export interface ExternalLogoResult {
  buffer: Buffer;
  source: LogoSource;
  contentType: string | null;
  url: string;
}

/**
 * Options for building a LogoFetchResult
 */
export interface LogoFetchResultOptions {
  s3Key?: string;
  url?: string | null;
  source: LogoSource | null;
  contentType?: string;
  isValid?: boolean;
  isGlobeIcon?: boolean;
  error?: string;
}

/**
 * Result from logo inversion operation
 */
export interface LogoInversionResult {
  buffer?: Buffer;
  analysis?: LogoInversion;
  cdnUrl?: string;
}
