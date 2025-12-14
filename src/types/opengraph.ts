/**
 * @fileoverview Type definitions for OpenGraph data handling.
 * @description Contains types for OpenGraph results, errors, and cache entries.
 * @module types/opengraph
 */

import type { SocialPlatform } from "./social";

/** For OG Image API results */
export interface OgFetchResult {
  imageUrl: string | null;
  bannerImageUrl?: string | null;
  profileImageUrl?: string | null;
  ogMetadata?: Record<string, string | undefined | null>;
  error?: string;
}

/**
 * Enhanced OpenGraph result with caching metadata.
 * This interface is the primary type for OpenGraph data
 * after it has been processed and enriched within the application.
 */
export interface OgResult extends OgFetchResult {
  /** The original URL requested */
  url: string;
  /** The final, canonical URL after any redirects */
  finalUrl?: string;
  /** The page title */
  title?: string;
  /** The page description */
  description?: string;
  /** The site name */
  siteName?: string;
  /** The page's locale */
  locale?: string;
  /** The timestamp of when the data was fetched */
  timestamp: number;
  /** The source of the data (e.g., "cache", "s3", "external") */
  source: "cache" | "s3" | "external" | "fallback";
  /** A hash of the original URL */
  urlHash?: string;
  /** The error object, if one was thrown */
  errorDetails?: OgError;
  /** A unique ID for the image asset in S3 */
  imageAssetId?: string;
  /** A unique ID for the screenshot asset in S3 */
  screenshotAssetId?: string;
  /** Associated social profiles */
  socialProfiles?: Partial<Record<SocialPlatform, string>>;
  /** Number of times a fetch has been retried */
  retryCount?: number;
  /** The actual URL resolved after redirects */
  actualUrl?: string;
}

// KarakeepImageFallback is now defined in types/seo/opengraph.ts
export type { KarakeepImageFallback } from "./seo/opengraph";

// Type alias with extra fields
export interface OgCacheEntry {
  data: OgResult;
  lastFetchedAt: number;
  lastAttemptedAt: number;
  isFailure?: boolean;
}

// Import the validated type from seo/opengraph to avoid duplication
import type { ValidatedOgMetadata } from "./seo/opengraph";

/** General OpenGraph metadata structure */
export type OgMetadata = ValidatedOgMetadata;

/**
 * Custom error for OpenGraph operations
 */
export class OgError extends Error {
  /** The source of the error (e.g., "fetch", "s3", "cache") */
  public source: string;
  /** The original error that was caught */
  public originalError?: unknown;

  constructor(message: string, source: string, options?: ErrorOptions & { originalError?: unknown }) {
    super(message, options);
    this.name = "OgError";
    this.source = source;
    this.originalError = options?.originalError;
  }
}

/**
 * Type guard to check if an object is a valid OgResult.
 * @param data - The data to check.
 * @returns True if the data is a valid OgResult.
 */
export function isOgResult(data: unknown): data is OgResult {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const d = data as OgResult;
  return typeof d.url === "string" && typeof d.timestamp === "number";
}

/**
 * Result of persisting an image to S3
 */
export interface PersistImageResult {
  s3Url: string | null;
  wasNewlyPersisted: boolean;
}
