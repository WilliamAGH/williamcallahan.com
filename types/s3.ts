/**
 * S3 File and Client Wrapper Type Definitions
 *
 * Defines interfaces for a Bun-compatible S3 client file handle and client wrapper.
 */

export interface S3File<T = unknown> {
  key: string;
  /** Parse the object body as JSON. */
  json: <U = T>() => Promise<U | null>;
  /** Read the object body as text. */
  text: () => Promise<string>;
  /** Read the object body as an ArrayBuffer. */
  arrayBuffer: () => Promise<ArrayBuffer>;
  /** Read the object body as a Blob. */
  blob: () => Promise<Blob>;
  /** Delete the object. */
  delete: () => Promise<void>;
  /** Return a slice of the object (passthrough). */
  slice: (start?: number, end?: number) => S3File<T>;
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
  list: (prefix?: string, options?: unknown) => Promise<{ contents: { key: string }[]; isTruncated: boolean }>;
}

export interface DistributedLockEntry {
  instanceId: string;
  acquiredAt: number;
  ttlMs: number;
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
