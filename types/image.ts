/**
 * Unified source types for image retrieval
 */

export type ImageSource =
  | "memory"
  | "s3"
  | "origin"
  | "external"
  | "cache"
  | "fallback"
  | "placeholder"
  | "google"
  | "duckduckgo"
  | "clearbit"
  | "unknown"
  | "api";

/**
 * Base interface for all image data
 * This is the foundation for image-related types across the system
 */
export interface BaseImageData {
  /** MIME content type (e.g., 'image/png', 'image/svg+xml') */
  contentType: string;
  /** Where the image was retrieved from */
  source: ImageSource;
  /** CDN URL if available */
  cdnUrl?: string;
  /** Error message if operation failed */
  error?: string;
  /** Timestamp of the operation */
  timestamp?: number;
}

/**
 * Image data with buffer (used in memory cache)
 */
export interface ImageDataWithBuffer extends BaseImageData {
  /** Image data buffer */
  buffer: Buffer;
}

/**
 * Image data without buffer (used for metadata)
 */
export interface ImageDataMetadata extends BaseImageData {
  /** S3 storage key */
  s3Key?: string;
  /** Size in bytes (when buffer is stored separately) */
  size?: number;
}

export interface ImageMemoryMetrics {
  cacheSize: number;
  cacheBytes: number;
  rss: number;
  heapUsed: number;
  external: number;
  memoryPressure: boolean;
}

export interface ImageServiceOptions {
  forceRefresh?: boolean;
  invertColors?: boolean;
  maxSize?: number;
  quality?: number;
  format?: "jpeg" | "jpg" | "png" | "webp" | "avif" | "gif";
  width?: number;
}

/**
 * Result from image service operations
 * Can contain either buffer or just metadata
 */
export interface ImageResult extends BaseImageData {
  buffer?: Buffer;
  s3Key?: string;
  s3Url?: string;
}

/**
 * Result from external image/logo fetch operations
 * Always includes buffer and source information
 */
export interface ExternalFetchResult {
  /** Image data buffer */
  buffer: Buffer;
  /** Source service that provided the image */
  source: import("./logo").LogoSource;
  /** MIME content type */
  contentType: string;
  /** Optional URL where the image was fetched from */
  url?: string;
}
