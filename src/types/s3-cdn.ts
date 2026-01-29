/**
 * S3, CDN, and Storage Type Definitions
 *
 * Consolidated type definitions for S3 operations, CDN configuration, key generation,
 * failure tracking, and related storage utilities.
 * For schemas related to specific data stored in S3 (e.g., bookmarks index),
 * see the relevant schema files in `lib/schemas/`.
 */

export interface S3File {
  key: string;
  /** Parse the object body as JSON. Callers must validate with Zod at the boundary. */
  json: () => Promise<unknown>;
  /** Read the object body as text. */
  text: () => Promise<string>;
  /** Read the object body as an ArrayBuffer. */
  arrayBuffer: () => Promise<ArrayBuffer>;
  /** Read the object body as a Blob. */
  blob: () => Promise<Blob>;
  /** Delete the object. */
  delete: () => Promise<void>;
  /** Return a slice of the object (passthrough). */
  slice: (start?: number, end?: number) => S3File;
  /** Get a writer to stream data for upload. */
  writer: () => {
    /** Write a chunk (string or binary view) */
    write: (chunk: string | ArrayBuffer | ArrayBufferView) => number;
    /** Finalize the write. */
    end: () => Promise<void>;
  };
}

export interface S3ClientWrapper {
  /** Get a file handle by key. */
  file: (key: string) => S3File;
  /** List objects by prefix. */
  list: (
    prefix?: string,
    options?: unknown,
  ) => Promise<{ contents: { key: string }[]; isTruncated: boolean }>;
}

export interface StreamToS3Options {
  bucket: string;
  key: string;
  contentType: string;
  s3Client: import("@aws-sdk/client-s3").S3Client;
}

export interface StreamingResult {
  success: boolean;
  location?: string;
  error?: Error;
  bytesStreamed?: number;
}

// --- CDN Configuration ---
export interface CdnConfig {
  cdnBaseUrl?: string;
  s3BucketName?: string;
  s3ServerUrl?: string;
}

// --- Failure Tracking ---
export interface FailureRecord {
  failureCount: number;
  lastFailure: number;
  firstFailure: number;
  lastError?: string;
}

export interface FailureTrackerOptions {
  s3Path?: string;
  maxRetries?: number;
  cooldownMs?: number;
  maxItems?: number;
  name?: string;
}

export interface FailedItem<T> {
  item: T;
  attempts: number;
  lastAttempt: number;
  permanentFailure?: boolean;
  reason?: string;
}

export interface FailureTrackerConfig {
  /** S3 path for persistence */
  s3Path: string;
  /** Maximum retry attempts before marking as permanent failure */
  maxRetries?: number;
  /** Cooldown period in ms before retrying */
  cooldownMs?: number;
  /** Maximum items to track */
  maxItems?: number;
  /** Name for logging */
  name?: string;
}

// --- S3 Key Generation ---
export interface S3KeyOptions {
  /** Asset type */
  type: "logo" | "opengraph" | "image" | "avatar" | "banner";
  /** Domain for logos */
  domain?: string;
  /** Logo source */
  source?: import("@/types/logo").LogoSource;
  /** URL for hashing */
  url?: string;
  /** Custom hash if pre-computed */
  hash?: string;
  /** File extension */
  extension?: string;
  /** Inverted variant */
  inverted?: boolean;
  /** Additional variant suffix */
  variant?: string;
}

export interface ParsedS3Key {
  type: "logo" | "opengraph" | "image" | "avatar" | "banner" | "unknown";
  domain?: string;
  source?: string;
  hash?: string;
  extension?: string;
  inverted?: boolean;
}

// Alias for backward compatibility (if needed)
export type S3KeyMetadata = ParsedS3Key;

/**
 * Content type categories for automatic ACL determination
 */
export enum ContentCategory {
  PublicAsset = "public-asset", // Images, CSS, JS - always public
  PublicData = "public-data", // JSON data meant for public consumption
  PrivateData = "private-data", // Sensitive data - always private
  Html = "html", // HTML content - configurable
}
