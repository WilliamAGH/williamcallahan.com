/**
 * Type Definitions Index
 *
 * Central export point for all type definitions used across the application.
 * Organizes types by domain/feature area.
 */

export * from "./experience";
export * from "./navigation";
export * from "./social";
export * from "./terminal";
export * from "./bookmark";
export * from "./github";
export * from "./logo";
export * from "./error";

// Add new interface for client error payloads
export interface ClientErrorPayload {
  message?: string;
  resource?: string; // e.g., script URL if it's a script error
  type?: string; // e.g., 'ChunkLoadError', 'TypeError'
  url?: string; // The URL where the error occurred
  stack?: string;
  buildId?: string; // Next.js build ID
  // Allow other properties that might be sent from various client-side error sources
  [key: string]: unknown; // Use unknown instead of any for better type safety
}

// For OG Image API results
export interface OgFetchResult {
  imageUrl: string | null; // Can be null if no image found
  bannerImageUrl?: string | null;
  ogMetadata?: Record<string, string | undefined | null>; // OG tags can have various string values or be absent
  error?: string;
}

// Enhanced OpenGraph result with caching metadata
export interface OgResult extends OgFetchResult {
  /** Timestamp when the data was fetched */
  timestamp: number;
  /** Source of the data */
  source: "cache" | "external" | "fallback";
  /** Number of retry attempts made */
  retryCount?: number;
  /** URL that was actually fetched (may differ from requested URL due to redirects) */
  actualUrl?: string;
}

// Karakeep image fallback data for OpenGraph enhancement
export interface KarakeepImageFallback {
  /** Direct image URL from Karakeep's own OG crawling */
  imageUrl?: string | null;
  /** Karakeep image asset ID - can construct URL */
  imageAssetId?: string | null;
  /** Karakeep screenshot asset ID - can construct URL */
  screenshotAssetId?: string | null;
  /** Base URL for Karakeep API to construct asset URLs */
  karakeepBaseUrl?: string;
}

// OpenGraph cache entry for server-side caching
export interface OgCacheEntry extends OgResult {
  /** Last successful fetch timestamp */
  lastFetchedAt: number;
  /** Last fetch attempt timestamp */
  lastAttemptedAt: number;
  /** Whether this entry represents a failed fetch */
  isFailure?: boolean;
}

// OpenGraph metadata structure
export interface OgMetadata {
  title?: string | null;
  description?: string | null;
  image?: string | null;
  twitterImage?: string | null;
  site?: string | null;
  type?: string | null;
  profileImage?: string | null;
  bannerImage?: string | null;
  url?: string | null;
  siteName?: string | null;
  // Allow additional string properties
  [key: string]: string | null | undefined;
}
