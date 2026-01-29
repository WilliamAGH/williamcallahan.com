/**
 * Shared base interface for all media results (images and logos)
 * Contains properties common to both ImageResult and LogoResult
 */
export interface BaseMediaResult {
  /** MIME content type (e.g., 'image/png', 'image/svg+xml') */
  contentType: string;
  /** CDN URL if available for serving */
  cdnUrl?: string;
  /** Error message if operation failed */
  error?: string;
  /** Timestamp of the operation */
  timestamp?: number;
  /** Image data buffer when available */
  buffer?: Buffer;
  /** S3 storage key where the media is stored */
  s3Key?: string;
}

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
  /** Skip S3 uploads (useful in dev/stubbed environments). */
  skipUpload?: boolean;
  /** Optional timeout override for fetch/process pipeline (milliseconds). */
  timeoutMs?: number;
  /** When true, returns a cloned buffer so callers can safely read it after internal zero-fill. */
  retainBuffer?: boolean;
  /**
   * Logical grouping for the image (e.g. 'opengraph', 'logo').
   * Used exclusively for deterministic S3 key generation.
   * **Do not** rely on this for rendering decisions.
   */
  type?: string;
}

/**
 * Result from image service operations
 * Can contain either buffer or just metadata
 */
export interface ImageResult extends BaseMediaResult {
  /** Where the image was retrieved from */
  source: ImageSource;
  /** Direct S3 URL (in addition to CDN URL) */
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

/**
 * Result of processing an image buffer
 * Used by shared image processing utilities
 */
export interface ProcessedImageResult {
  /** Processed image buffer */
  processedBuffer: Buffer;
  /** MIME content type after processing */
  contentType: string;
  /** Whether the image is SVG format */
  isSvg: boolean;
}

/**
 * Logo manifest entry with CDN URL and original source
 */
export interface LogoManifestEntry {
  /** CDN URL where the logo is stored */
  cdnUrl: string;
  /** Original source service (google, duckduckgo, clearbit, etc.) */
  originalSource: string;
  /** CDN URL pointing to pre-inverted (dark-theme) version of the logo, when available */
  invertedCdnUrl?: string;
}

/**
 * Logo manifest mapping domains to logo info
 */
export type LogoManifest = Record<string, LogoManifestEntry>;

/**
 * Generic image manifest as array of CDN URLs
 */
export type ImageManifest = string[];

/**
 * Mapping of static image local paths to CDN URLs
 */
export interface StaticImageMapping {
  [localPath: string]: string; // local path -> CDN URL
}

/**
 * Lightweight metadata extracted without `sharp` (via edge-compatible image header parser).
 * If you later re-introduce WASM-based processing you can extend this type.
 *
 * TODO(wasm-image): add alpha / ICC / EXIF when a WASM library is wired in.
 */
export interface BasicImageMeta {
  /** Detected format e.g. 'png', 'jpeg', 'webp', 'gif', 'svg', ... */
  format: string | undefined;
  /** Pixel width (may be undefined for some SVGs) */
  width: number | undefined;
  /** Pixel height */
  height: number | undefined;
  /** Best-guess whether an alpha channel exists – edge-compatible parser cannot detect this */
  hasAlpha: boolean;
  /** Whether multiple frames/pages were detected (i.e. animation) */
  animated: boolean;
}

/**
 * Image signature containing multiple comparison metrics
 */
export interface ImageSignature {
  exactHash: string;
  structuralHash: string;
  colorSignature: number[];
  fileSize: number;
  dimensions: { width: number; height: number };
  format: string;
  entropy: number;
}
