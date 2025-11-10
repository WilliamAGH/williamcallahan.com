/**
 * S3 Storage Utility Functions
 *
 * Provides a comprehensive interface for S3 operations including file read/write,
 * JSON handling, metadata access, object listing, and binary file management
 * Implements error handling and retry logic for improved reliability
 *
 * Build-time behavior:
 * - S3 READS: Always allowed (if credentials are provided)
 * - S3 WRITES: Blocked during build phase via isS3ReadOnly() check
 * - Missing credentials during build will show warnings but won't break the build
 *
 * @module lib/s3-utils
 */

import { Readable } from "node:stream";
import { debug, isDebug } from "@/lib/utils/debug"; // Imported isDebug
import { MEMORY_THRESHOLDS } from "@/lib/constants";
import { safeJsonParse, safeJsonStringify, parseJsonFromBuffer } from "@/lib/utils/json-utils";
import { envLogger } from "@/lib/utils/env-logger";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getMemoryHealthMonitor } from "@/lib/health/memory-health-monitor";
import { getContentTypeFromExtension, isImageContentType } from "@/lib/utils/content-type";

// Environment variables for S3 configuration
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
// S3_REGION variable moved into getS3Client function
const DRY_RUN = process.env.DRY_RUN === "true";
// Use canonical public CDN env vars only. Legacy S3_PUBLIC_CDN_URL is no longer referenced.
const CDN_BASE_URL = process.env.S3_CDN_URL || process.env.NEXT_PUBLIC_S3_CDN_URL || ""; // Public CDN endpoint
const isS3DebugLoggingEnabled =
  process.env.DEBUG_S3 === "true" ||
  process.env.DEBUG_BOOKMARKS === "true" ||
  process.env.DEBUG === "true" ||
  process.env.VERBOSE === "true";

const logS3Debug = (message: string, data?: Record<string, unknown>): void => {
  if (!isS3DebugLoggingEnabled) return;
  envLogger.log(message, data, { category: "S3Utils" });
};

// Constants for S3 read retries with exponential backoff and jitter
const MAX_S3_READ_RETRIES = 3; // Actually do 3 retry attempts
const S3_READ_RETRY_BASE_DELAY_MS = 100; // Base delay of 100ms
const S3_READ_RETRY_MAX_DELAY_MS = 5000; // Max delay of 5 seconds

// Memory protection constants
const MAX_S3_READ_SIZE = 50 * 1024 * 1024; // 50MB max read size to prevent memory exhaustion
// Memory pressure threshold moved to coordinated detection in isUnderMemoryPressure()

// Request coalescing for duplicate S3 reads
const inFlightReads = new Map<string, Promise<Buffer | string | null>>();

// Helper: check if S3 is fully configured (now a function for dynamic checking)
function isS3FullyConfigured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY);
}

let hasLoggedMissingS3Config = false;
function logMissingS3ConfigOnce(context: string): void {
  if (!hasLoggedMissingS3Config) {
    envLogger.log(
      "Missing S3 configuration (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3_SERVER_URL is optional. All S3 operations will be skipped.",
      undefined,
      { category: "S3Utils" },
    );
    hasLoggedMissingS3Config = true;
  }
  if (isDebug) debug(`[S3Utils] Skipping ${context} because S3 is not configured.`);
}

// Utility: determine if an S3 key represents a potentially large binary (image) payload
function isBinaryKey(key: string): boolean {
  // Fast-path: any key stored under images/ directory is binary
  if (key.startsWith("images/")) return true;

  // Otherwise infer from file extension using centralized helpers
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  const contentType = getContentTypeFromExtension(ext);
  return isImageContentType(contentType);
}

// Only warn about missing S3 config if we're not in build phase
// During build, S3 write operations are intentionally disabled so missing config is expected
if (!S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    envLogger.log(
      "Missing one or more S3 configuration environment variables (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). S3_SERVER_URL is optional. S3 operations may fail.",
      undefined,
      { category: "S3Utils" },
    );
  }
}

// Lazy initialization of S3 client to ensure environment variables are loaded
let s3ClientInstance: S3Client | null = null;
let hasLoggedS3ClientInitialization = false;

// Export a function to reset client for testing
export function resetS3Client(): void {
  s3ClientInstance = null;
}

export function getS3Client(): S3Client | null {
  if (s3ClientInstance !== null) {
    return s3ClientInstance;
  }

  // Re-read environment variables on each initialization attempt
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_SERVER_URL; // may be undefined (SDK default endpoint)
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || process.env.AWS_REGION || "us-east-1";

  if (bucket && accessKeyId && secretAccessKey) {
    const baseConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      maxAttempts: 5,
      retryMode: "adaptive" as const,
    };
    s3ClientInstance = endpoint ? new S3Client({ ...baseConfig, endpoint }) : new S3Client(baseConfig);
    const initDetails = { bucket, endpoint: endpoint || "SDK default", region } as const;
    if (!hasLoggedS3ClientInitialization) {
      // Structured, one-line init summary for diagnostics (first call only)
      envLogger.log(`S3 client initialized`, initDetails, { category: "S3Utils" });
      hasLoggedS3ClientInitialization = true;
    } else {
      envLogger.debug(`S3 client already initialized`, initDetails, { category: "S3Utils" });
    }
    if (isDebug)
      debug(`[S3Utils] S3-compatible client initialized (${endpoint ? "custom endpoint" : "sdk default endpoint"}).`);
  } else {
    envLogger.log(
      `CRITICAL: S3 client not initialized`,
      {
        S3_BUCKET: bucket ? "set" : "MISSING",
        S3_SERVER_URL: endpoint ? "set" : "not required",
        S3_ACCESS_KEY_ID: accessKeyId ? "set" : "MISSING",
        S3_SECRET_ACCESS_KEY: secretAccessKey ? "set" : "MISSING",
      },
      { category: "S3Utils" },
    );
  }

  return s3ClientInstance;
}

export const s3Client = new Proxy({} as S3Client, {
  get(target, prop) {
    void target; // Explicitly mark as unused per project convention
    const client = getS3Client();
    if (!client) return null;
    return client[prop as keyof S3Client];
  },
});

/**
 * Check if system is under memory pressure
 */
function isUnderMemoryPressure(): boolean {
  const monitor = getMemoryHealthMonitor();
  return !monitor.shouldAcceptNewRequests();
}

/**
 * Check if system has enough memory headroom for S3 operations
 */
function hasMemoryHeadroom(): boolean {
  if (typeof process === "undefined") return true;

  const monitor = getMemoryHealthMonitor();
  if (!monitor.shouldAcceptNewRequests()) return false;

  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  const rssCritical = MEMORY_THRESHOLDS.MEMORY_CRITICAL_THRESHOLD;
  const HEAP_UTIL_THRESHOLD = 0.9;
  const heapUtilization = heapTotal > 0 ? heapUsed / heapTotal : 0;

  return rss <= rssCritical && heapUtilization < HEAP_UTIL_THRESHOLD;
}

/**
 * Validate content size before reading to prevent memory exhaustion
 */
async function validateContentSize(key: string): Promise<boolean> {
  const client = getS3Client();
  if (!client || !S3_BUCKET) return true; // Skip validation if S3 not configured

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    });
    const response = await client.send(command);
    const contentLength = response.ContentLength;

    if (contentLength && contentLength > MAX_S3_READ_SIZE) {
      envLogger.log(
        `Object too large. Skipping read to prevent memory exhaustion`,
        { key, contentLength, max: MAX_S3_READ_SIZE },
        { category: "S3Utils" },
      );
      return false;
    }

    return true;
  } catch (error) {
    // If we can't get size, allow the read to proceed (might be a permissions issue)
    if (isDebug) debug(`[S3Utils] Could not validate size for ${key}:`, error);
    return true;
  }
}

/**
 * Retrieves an object from S3 by key, optionally using a byte range.
 *
 * Note: This function is NOT blocked during build time - reads are always allowed
 * if S3 credentials are available.
 *
 * Returns the object content as a UTF-8 string for text or JSON types, or as a Buffer for other content types. If the object is not found or an error occurs, returns null.
 *
 * @param key - The S3 object key to read
 * @param options - Optional settings, including a byte range for partial reads
 * @returns The object content as a string or Buffer, or null if not found or on error
 *
 * @remark Retries up to MAX_S3_READ_RETRIES times on transient "not found" errors before returning null
 */
export async function readFromS3(
  key: string,
  options?: { range?: string }, // Add optional options object
): Promise<Buffer | string | null> {
  // Check for in-flight request coalescing (only for non-range requests)
  const cacheKey = options?.range ? `${key}:${options.range}` : key;
  if (!options?.range && inFlightReads.has(cacheKey)) {
    if (isDebug) debug(`[S3Utils] Coalescing duplicate read request for ${key}`);
    const existingPromise = inFlightReads.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }
  }

  // Create promise for this read operation with guaranteed cleanup
  const readPromise = performS3Read(key, options).finally(() => {
    // Ensure cleanup even if performS3Read throws synchronously
    if (!options?.range) {
      inFlightReads.delete(cacheKey);
    }
  });

  // Track in-flight request only for non-range requests
  if (!options?.range) {
    inFlightReads.set(cacheKey, readPromise);
  }
  return readPromise;
}

async function performS3Read(key: string, options?: { range?: string }): Promise<Buffer | string | null> {
  // Skip debug logging for refresh-lock checks to reduce noise
  if (!key.includes("refresh-lock")) {
    logS3Debug("performS3Read called", { key });
  }

  if (isUnderMemoryPressure() && isBinaryKey(key)) {
    // Allow small binaries (e.g., logos) under pressure, but block anything exceeding MAX_S3_READ_SIZE.
    const canProceed = await validateContentSize(key);
    if (!canProceed) {
      envLogger.log(`System under memory pressure. Deferring binary read`, { key }, { category: "S3Utils" });
      return null;
    }
  }

  // Validate content size before reading (skip for range requests)
  if (!options?.range && !(await validateContentSize(key))) {
    return null;
  }

  // Bypass public CDN for JSON files to avoid stale cache; only use CDN for non-JSON
  const isJson = key.endsWith(".json");
  if (!isJson && CDN_BASE_URL) {
    const cdnUrl = `${CDN_BASE_URL.replace(/\/+$/, "")}/${key}`;
    if (isDebug) debug(`[S3Utils] Attempting to read key ${key} via CDN: ${cdnUrl}`);

    // Use AbortController to prevent hanging requests
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000); // 10 second timeout

    try {
      const res = await fetch(cdnUrl, {
        signal: abortController.signal,
        headers: {
          "User-Agent": "S3Utils/1.0", // Identify requests
        },
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        // Check content length before reading
        const contentLength = res.headers.get("content-length");
        if (contentLength && parseInt(contentLength, 10) > MAX_S3_READ_SIZE) {
          envLogger.log(
            `CDN response too large. Skipping`,
            { contentLength: Number(contentLength), max: MAX_S3_READ_SIZE },
            { category: "S3Utils" },
          );
          return null;
        }

        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = res.headers.get("content-type") || "";
        if (isDebug)
          debug(`[S3Utils] Successfully read key ${key} from CDN. ContentType: ${contentType}, Size: ${buffer.length}`);
        if (contentType.startsWith("text/") || contentType.includes("application/json")) {
          return buffer.toString("utf-8");
        }
        return buffer;
      }
      if (isDebug)
        debug(
          `[S3Utils] CDN fetch failed for ${cdnUrl}: ${res.status} ${res.statusText}. Falling back to direct S3 read.`,
        );
    } catch (err) {
      clearTimeout(timeoutId);
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (isDebug) debug(`[S3Utils] CDN fetch error for ${cdnUrl}: ${errorMessage}. Falling back to direct S3 read.`);
    }
    // Fallback to AWS SDK if CDN fetch fails
  }
  if (DRY_RUN) {
    if (isDebug)
      debug(`[S3Utils][DRY RUN] Would read from S3 key ${key}${options?.range ? ` with range ${options.range}` : ""}`);
    return null;
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    logMissingS3ConfigOnce("readFromS3");
    return null;
  }

  if (isDebug)
    debug(
      `[S3Utils] Attempting direct S3 read for key: ${key} ${options?.range ? ` with range ${options.range}` : ""}`,
    );
  for (let attempt = 1; attempt <= MAX_S3_READ_RETRIES; attempt++) {
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Range: options?.range, // Pass range option if provided
    });

    try {
      const { Body, ContentType } = await client.send(command);
      if (Body instanceof Readable) {
        const buffer = await streamToBuffer(Body);
        if (isDebug)
          debug(
            `[S3Utils] Successfully read key ${key} directly from S3 (attempt ${attempt}/${MAX_S3_READ_RETRIES}). ContentType: ${ContentType ?? "unknown"}, Size: ${buffer.length}`,
          );
        // If it's likely text, return as string, otherwise as buffer
        if (ContentType?.startsWith("text/") || ContentType === "application/json") {
          return buffer.toString("utf-8");
        }
        return buffer;
      }
      if (isDebug)
        debug(
          `[S3Utils] Direct S3 read for key ${key} (attempt ${attempt}/${MAX_S3_READ_RETRIES}): Body was not a Readable stream.`,
        );
      return null; // Should not happen if Body is present and Readable
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
      if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
        if (isDebug) debug(`[S3Utils] readFromS3: Key ${key} not found (attempt ${attempt}/${MAX_S3_READ_RETRIES}).`);
        if (attempt < MAX_S3_READ_RETRIES) {
          // Calculate exponential backoff with jitter
          const baseDelay = Math.min(S3_READ_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), S3_READ_RETRY_MAX_DELAY_MS);
          const jitter = Math.random() * baseDelay * 0.3; // 30% jitter
          const delay = Math.round(baseDelay + jitter);

          if (isDebug)
            debug(`[S3Utils] Retrying read for ${key} in ${delay}ms (attempt ${attempt}/${MAX_S3_READ_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue; // Next attempt
        }
        if (isDebug) {
          // Special case: refresh-lock not existing is normal (no refresh in progress)
          if (key.includes("refresh-lock")) {
            envLogger.debug("Refresh lock not found (idle state)", { key }, { category: "S3Utils" });
          } else {
            debug(`[S3Utils] readFromS3: All ${MAX_S3_READ_RETRIES} attempts failed for key ${key}. Returning null.`);
          }
        }
        return null; // All retries failed
      }
      const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
      const code = err.Code ?? err.name ?? "unknown";
      const status = err.$metadata?.httpStatusCode ?? "unknown";
      envLogger.log(
        `Error reading from S3`,
        { key, attempt: `${attempt}/${MAX_S3_READ_RETRIES}`, status, code, message },
        { category: "S3Utils" },
      );
      return null;
    }
  }
  return null;
}

/**
 * Writes an object to S3.
 *
 * Note: This is a low-level function that does NOT check isS3ReadOnly().
 * Use writeJsonS3() or writeBinaryS3() which properly handle build-time blocking.
 *
 * @param key The S3 object key
 * @param data The data to write (string or Buffer)
 * @param contentType The MIME type of the content
 * @param acl The access control list permission (defaults to private for security)
 */
export async function writeToS3(
  key: string,
  data: Buffer | string | Readable,
  contentType?: string,
  acl: "private" | "public-read" | "public-read-write" | "authenticated-read" = "private",
): Promise<void> {
  const SMALL_PAYLOAD_THRESHOLD = 512 * 1024; // 512 KB
  const OPENGRAPH_IMAGE_THRESHOLD = 2 * 1024 * 1024; // 2 MB - reasonable limit for OpenGraph images
  const ABSOLUTE_BINARY_WRITE_MAX = (() => {
    const raw = process.env.ABSOLUTE_BINARY_WRITE_MAX_BYTES;
    const parsed = raw != null ? Number(raw) : Number.NaN;
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 10 * 1024 * 1024;
    return value;
  })(); // Absolute cap for ALL binary writes (default: 10 MB)
  const dataSize =
    typeof data === "string"
      ? Buffer.byteLength(data, "utf-8")
      : Buffer.isBuffer(data)
        ? data.length
        : SMALL_PAYLOAD_THRESHOLD; // Unknown stream size – treat as small for head-room check

  // ABSOLUTE CAP: Prevent OOM by limiting ALL binary writes regardless of process type
  if (isBinaryKey(key) && dataSize > ABSOLUTE_BINARY_WRITE_MAX) {
    throw new Error(
      `[S3Utils] Binary S3 write exceeds absolute maximum: ${dataSize} bytes (cap: ${ABSOLUTE_BINARY_WRITE_MAX} bytes). ` +
        `This safety limit prevents OOM errors even for data updater processes.`,
    );
  }

  // Skip memory checks during explicit dev-only migration builds (disabled in prod)
  const isDevMigrationRun = false; // Migration mode env flag removed – always false in production

  // CRITICAL: Data updater process MUST bypass memory checks to ensure scheduled updates succeed
  const isDataUpdater = process.env.IS_DATA_UPDATER === "true";

  if (!isDevMigrationRun && !isDataUpdater) {
    if (isBinaryKey(key)) {
      // For binary payloads, use different thresholds based on the type of image
      const isOpenGraphImage = key.includes("images/opengraph/");
      const threshold = isOpenGraphImage ? OPENGRAPH_IMAGE_THRESHOLD : SMALL_PAYLOAD_THRESHOLD;

      // For binary payloads, only block when (a) the process is under
      // memory pressure *and* (b) the payload is larger than the
      // threshold. OpenGraph images get a higher threshold (2MB) since
      // they're essential for bookmark previews.

      if (dataSize > threshold && !hasMemoryHeadroom()) {
        throw new Error(`[S3Utils] Insufficient memory headroom for binary S3 write operation (>${threshold} bytes)`);
      }
    } else if (!hasMemoryHeadroom() && dataSize > SMALL_PAYLOAD_THRESHOLD) {
      // For non-binary (JSON/string) data, still guard very large writes
      throw new Error(`[S3Utils] Insufficient memory headroom for large S3 write operation`);
    }
  }

  // Log when data updater bypasses memory check for images
  if (isDataUpdater && !hasMemoryHeadroom() && isBinaryKey(key)) {
    envLogger.log("Data updater bypassing memory check for binary", { key }, { category: "S3Utils" });
  }

  if (DRY_RUN) {
    if (isDebug)
      debug(
        `[S3Utils][DRY RUN] Would write to S3 key ${key}. ContentType: ${contentType ?? "unknown"}, ACL: ${acl}, Data size: ${
          typeof data === "string" ? dataSize : Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    return;
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    // During build phase without credentials, silently skip writes instead of logging warnings
    if (process.env.NEXT_PHASE === "phase-production-build") {
      if (isDebug) debug(`[S3Utils] Skipping S3 write during build (no credentials) for key: ${key}`);
      return;
    }
    logMissingS3ConfigOnce("writeToS3");
    return;
  }
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
    ACL: acl,
  });

  try {
    if (isDebug)
      debug(
        `[S3Utils] Attempting to write to S3 key ${key}. ContentType: ${contentType ?? "unknown"}, Data size: ${
          typeof data === "string" ? dataSize : Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    else envLogger.log(`Writing to S3`, { key, acl }, { category: "S3Utils" });
    const response = await client.send(command);
    if (isDebug) debug(`[S3Utils] Successfully wrote to S3 key ${key}`);
    else envLogger.log(`Wrote to S3`, { key, acl, etag: response.ETag }, { category: "S3Utils" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Error writing to S3`, { key, message }, { category: "S3Utils" });
    // Re-throw the error so callers like writeBinaryS3 can catch it if needed
    throw error;
  }
}

/**
 * Checks if an object exists in S3.
 * @param key The S3 object key
 * @returns True if the object exists, false otherwise
 */
export async function checkIfS3ObjectExists(key: string): Promise<boolean> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would check existence of S3 key ${key}`);
    return false;
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    logMissingS3ConfigOnce("checkIfS3ObjectExists");
    return false;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Checking existence of S3 key: ${key}`);
    await client.send(command);
    if (isDebug) debug(`[S3Utils] S3 key ${key} exists.`);
    return true;
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      if (isDebug) debug(`[S3Utils] S3 key ${key} does not exist (NotFound).`);
      return false;
    }
    const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
    envLogger.log(`Error checking S3 object existence`, { key, message }, { category: "S3Utils" });
    return false;
  }
}

/**
 * Retrieves metadata for an S3 object
 * @param key The S3 object key
 * @returns Object metadata (ETag, LastModified) or null if not found or error
 */
export async function getS3ObjectMetadata(key: string): Promise<{ ETag?: string; LastModified?: Date } | null> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would get metadata for S3 key ${key}`);
    return null;
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    logMissingS3ConfigOnce("getS3ObjectMetadata");
    return null;
  }
  const command = new HeadObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Getting metadata for S3 key: ${key}`);
    const response = await client.send(command);
    if (isDebug)
      debug(
        `[S3Utils] Successfully got metadata for S3 key ${key}. ETag: ${response.ETag ?? "undefined"}, LastModified: ${response.LastModified ? response.LastModified.toISOString() : "undefined"}`,
      );
    return {
      ETag: response.ETag,
      LastModified: response.LastModified,
    };
  } catch (error: unknown) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      if (isDebug) debug(`[S3Utils] Metadata not found for S3 key ${key} (NotFound).`);
      return null;
    }
    const message = err instanceof Error ? err.message : safeJsonStringify(err) || "Unknown error";
    envLogger.log(`Error getting S3 object metadata`, { key, message }, { category: "S3Utils" });
    return null;
  }
}

/**
 * Lists objects in S3 under a given prefix.
 * @param prefix The prefix to filter objects by
 * @returns An array of object keys, or an empty array if error or no objects
 */
export async function listS3Objects(prefix: string): Promise<string[]> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would list S3 objects with prefix ${prefix}`);
    return [];
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    logMissingS3ConfigOnce("listS3Objects");
    return [];
  }
  const keys: string[] = [];
  let continuationToken: string | undefined;

  try {
    if (isDebug) debug(`[S3Utils] Listing S3 objects with prefix: ${prefix}`);
    do {
      const command = new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });
      const response = await client.send(command);
      if (response.Contents) {
        for (const item of response.Contents) {
          if (item.Key) {
            keys.push(item.Key);
          }
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);
    if (isDebug) debug(`[S3Utils] Found ${keys.length} S3 objects with prefix ${prefix}.`);
    return keys;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Error listing S3 objects`, { prefix, message }, { category: "S3Utils" });
    return [];
  }
}

/**
 * Deletes an object from S3.
 * @param key The S3 object key to delete
 */
export async function deleteFromS3(key: string): Promise<void> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would delete S3 object: ${key}`);
    return;
  }
  const client = getS3Client();
  if (!isS3FullyConfigured() || !client) {
    logMissingS3ConfigOnce("deleteFromS3");
    return;
  }
  const command = new DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });

  try {
    if (isDebug) debug(`[S3Utils] Attempting to delete S3 object: ${key}`);
    await client.send(command);
    if (isDebug) debug(`[S3Utils] Successfully deleted S3 object: ${key}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Error deleting S3 object`, { key, message }, { category: "S3Utils" });
  }
}

// Helper to convert stream to buffer with size limit protection
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    let timeoutId: NodeJS.Timeout | undefined;

    // Set timeout to prevent hanging streams
    const STREAM_TIMEOUT_MS = 30000; // 30 seconds
    timeoutId = setTimeout(() => {
      stream.destroy();
      // Clear accumulated chunks to prevent memory retention
      chunks.length = 0;
      reject(new Error("Stream timeout: took longer than 30 seconds"));
    }, STREAM_TIMEOUT_MS);

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    stream.on("data", (chunk: Buffer) => {
      totalSize += chunk.length;

      // Prevent memory exhaustion
      if (totalSize > MAX_S3_READ_SIZE) {
        cleanup();
        stream.destroy();
        // Clear accumulated chunks to prevent memory retention
        chunks.length = 0;
        reject(new Error(`Stream too large: ${totalSize} bytes exceeds ${MAX_S3_READ_SIZE} bytes`));
        return;
      }

      chunks.push(chunk);
    });

    stream.on("error", error => {
      cleanup();
      reject(error);
    });

    stream.on("end", () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    });

    // Handle stream destruction
    stream.on("close", () => {
      cleanup();
    });
  });
}

// --- NEW JSON Helpers ---

/**
 * Reads data from an S3 JSON object
 *
 * Note: This function is NOT blocked during build time - reads are always allowed
 * if S3 credentials are available.
 *
 * @param s3Key S3 object key
 * @returns Parsed JSON data or null if an error occurs
 */
export async function readJsonS3<T>(s3Key: string): Promise<T | null> {
  const isRefreshLockKey = s3Key.includes("refresh-lock");
  if (isRefreshLockKey) {
    logS3Debug("Checking refresh lock", { key: s3Key });
  } else {
    logS3Debug("readJsonS3 invoked", { key: s3Key });
  }

  if (DRY_RUN) {
    logS3Debug(`[DRY RUN] Would read JSON from S3`, { key: s3Key });
    return null;
  }

  try {
    // Debug logging only in development (readFromS3 has its own debug logging)
    const content = await readFromS3(s3Key);

    if (content === null) {
      // Special handling for refresh-lock: it's normal for it not to exist
      if (isRefreshLockKey) {
        logS3Debug("Refresh lock: idle", { key: s3Key });
      } else {
        envLogger.log("S3 JSON read returned null", { key: s3Key }, { category: "S3Utils" });
      }
      return null;
    }

    if (typeof content === "string") {
      logS3Debug(`Content loaded`, { type: "string", length: content.length });
      const parsed = safeJsonParse<T>(content);
      if (parsed !== null) {
        logS3Debug(`Parsed JSON successfully`, { key: s3Key });
        if (isDebug) debug(`[S3Utils] Successfully read and parsed JSON from S3 key ${s3Key}.`);
      } else {
        envLogger.log(`Failed to parse JSON content`, { key: s3Key }, { category: "S3Utils" });
      }
      return parsed;
    }

    if (Buffer.isBuffer(content)) {
      logS3Debug(`Content loaded`, { type: "buffer", size: content.length });
      const parsed = parseJsonFromBuffer<T>(content, "utf-8");
      if (parsed !== null) {
        logS3Debug(`Parsed JSON from buffer`, { key: s3Key });
        if (isDebug) debug(`[S3Utils] Successfully read and parsed JSON (from buffer) from S3 key ${s3Key}.`);
      } else {
        envLogger.log(`Failed to parse JSON from buffer`, { key: s3Key }, { category: "S3Utils" });
      }
      return parsed;
    }

    envLogger.log(`Unexpected content type`, { key: s3Key, type: typeof content }, { category: "S3Utils" });
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`CRITICAL ERROR reading/parsing JSON`, { key: s3Key, message }, { category: "S3Utils" });
    return null;
  }
}

/**
 * Writes data to an S3 JSON object with optional conditional write support
 *
 * Note: This function is BLOCKED during build time via isS3ReadOnly() check.
 * During build phase (NEXT_PHASE=phase-production-build), writes are skipped.
 *
 * @param s3Key S3 object key
 * @param data Data to write
 * @param options Optional parameters including IfNoneMatch for conditional writes
 */
export async function writeJsonS3<T>(s3Key: string, data: T, options?: { IfNoneMatch?: string }): Promise<void> {
  // CRITICAL: Validate environment path before any S3 write
  if (s3Key.includes("/bookmarks/") && s3Key.endsWith(".json")) {
    const { validateEnvironmentPath, getEnvironment } = await import("@/lib/config/environment");
    if (!validateEnvironmentPath(s3Key)) {
      const env = getEnvironment();
      envLogger.log(
        `ENVIRONMENT PATH MISMATCH PREVENTED`,
        { env, key: s3Key, note: "Path doesn't match expected environment suffix" },
        { category: "S3Utils" },
      );

      // In non-production, throw error to catch issues early
      if (env !== "production") {
        throw new Error(`Environment path validation failed: ${s3Key} doesn't match ${env} environment`);
      }
      return;
    }
  }

  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would write JSON to S3 key: ${s3Key}`);
    return;
  }

  // Check if S3 writes are disabled (e.g., during build time)
  const { isS3ReadOnly } = await import("./utils/s3-read-only");
  if (isS3ReadOnly()) {
    if (isDebug) debug(`[S3Utils][READ-ONLY] Skipping S3 write for key: ${s3Key}`);
    return;
  }

  // Add memory check before JSON stringify
  const jsonData = safeJsonStringify(data, 2);
  if (!jsonData) {
    throw new Error("Failed to stringify JSON data");
  }

  const dataSize = Buffer.byteLength(jsonData, "utf-8");
  const SMALL_PAYLOAD_THRESHOLD = 512 * 1024; // 512 KB

  // Allow tiny operational JSON files to bypass headroom checks (e.g., index/heartbeat)
  // Use the constants from BOOKMARKS_S3_PATHS to determine operational files
  const { BOOKMARKS_S3_PATHS } = await import("@/lib/constants");
  const isTinyOperationalFile =
    s3Key === BOOKMARKS_S3_PATHS.INDEX || s3Key === BOOKMARKS_S3_PATHS.HEARTBEAT || s3Key === BOOKMARKS_S3_PATHS.LOCK;

  // CRITICAL: Data updater process MUST bypass memory checks to ensure scheduled updates succeed
  const isDataUpdater = process.env.IS_DATA_UPDATER === "true";

  if (!isTinyOperationalFile && !isDataUpdater && !hasMemoryHeadroom() && dataSize > SMALL_PAYLOAD_THRESHOLD) {
    envLogger.log(
      `Skipping S3 write due to memory pressure`,
      { key: s3Key, sizeKB: Number((dataSize / 1024).toFixed(1)) },
      { category: "S3Utils" },
    );
    return;
  }

  // Log when data updater bypasses memory check
  if (isDataUpdater && !hasMemoryHeadroom()) {
    console.log(`[S3Utils] Data updater bypassing memory check for ${s3Key} (${(dataSize / 1024).toFixed(1)} KB)`);
  }

  try {
    // Prefer atomic conditional create when requested and client is available
    if (options?.IfNoneMatch === "*") {
      const client = getS3Client();
      // Check dynamically if S3 is configured (re-read env vars)
      const bucket = process.env.S3_BUCKET;
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      const isConfigured = Boolean(bucket && accessKeyId && secretAccessKey);

      if (!isConfigured || !client) {
        // If conditional write is requested but S3 is not configured, log error and return
        // Don't throw to maintain backward compatibility with tests
        envLogger.log("Cannot perform conditional write: S3 client not configured", undefined, { category: "S3Utils" });
        return;
      }
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        Body: jsonData,
        ContentType: "application/json",
        ACL: "public-read",
        IfNoneMatch: "*",
      });
      await client.send(command);
      return;
    }
    await writeToS3(s3Key, jsonData, "application/json", "public-read");
    // No need for redundant success log here, writeToS3 handles it.
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Failed to write JSON to S3`, { key: s3Key, message }, { category: "S3Utils" });
    throw error; // Re-throw other errors so callers can handle
  }
}

// ----------------------------------------------------------------------------
// Lock store abstraction for deterministic testing and alternative backends
// ----------------------------------------------------------------------------

import type { LockStore, LockEntry } from "@/types/lib";

const s3LockStore: LockStore = {
  async read(key) {
    return await readJsonS3<LockEntry>(key);
  },
  async createIfAbsent(key, value) {
    try {
      await writeJsonS3(key, value, { IfNoneMatch: "*" });
      return true;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "$metadata" in error) {
        const metadata = (error as { $metadata?: { httpStatusCode?: number } }).$metadata;
        if (metadata?.httpStatusCode === 412) return false;
      }
      throw error;
    }
  },
  async delete(key) {
    await deleteFromS3(key);
  },
  async list(prefix) {
    return await listS3Objects(prefix);
  },
};

/**
 * Reads a binary file (e.g., an image) from S3
 *
 * Note: This function is NOT blocked during build time - reads are always allowed
 * if S3 credentials are available.
 *
 * @param s3Key S3 object key
 * @returns Buffer or null
 */
export async function readBinaryS3(s3Key: string): Promise<Buffer | null> {
  if (DRY_RUN) {
    if (isDebug) debug(`[S3Utils][DRY RUN] Would read binary from S3 key ${s3Key}`);
    return null;
  }
  try {
    const content = await readFromS3(s3Key); // readFromS3 has debug logging
    if (Buffer.isBuffer(content)) {
      // Success already logged by readFromS3 if direct S3 read occurred.
      // If from CDN, readFromS3 also logs success.
      return content;
    }
    if (typeof content === "string") {
      // Handle text content (like CSV files) that should be treated as binary
      return Buffer.from(content, "utf-8");
    }
    if (isDebug) debug(`[S3Utils] readBinaryS3: Key ${s3Key} not found or content was not a buffer.`);
    return null;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Error reading binary file from S3`, { s3Key, message }, { category: "S3Utils" });
    return null;
  }
}

/**
 * Writes a binary file (e.g., an image) to S3.
 *
 * Note: This function is BLOCKED during build time via isS3ReadOnly() check.
 * During build phase (NEXT_PHASE=phase-production-build), writes are skipped.
 *
 * @param s3Key S3 object key
 * @param data Buffer to write
 * @param contentType MIME type of the content
 */
export async function writeBinaryS3(s3Key: string, data: Buffer | Readable, contentType: string): Promise<void> {
  if (DRY_RUN) {
    if (isDebug)
      debug(
        `[S3Utils][DRY RUN] Would write binary file to S3 key: ${s3Key}. ContentType: ${contentType}, Size: ${
          Buffer.isBuffer(data) ? data.length : "stream"
        }`,
      );
    return;
  }

  // 🔄 Ensure data passed to S3 has a known length. When a Readable stream is
  // supplied (e.g. from node-fetch), AWS SDK v3 will attempt to infer the
  // payload size. If the size cannot be derived it sets the internal
  // `x-amz-decoded-content-length` header to `undefined`, causing the exact
  // error observed (`Invalid value "undefined" for header "x-amz-decoded-content-length"`).
  // To avoid this, convert small logo streams to a Buffer first. The typical
  // favicon-sized images are <50 KB so memory impact is negligible, and we
  // still honor the existing memory-headroom guard inside writeToS3 for
  // larger files.

  let payload: Buffer | Readable = data;

  if (!Buffer.isBuffer(payload)) {
    try {
      const { Readable } = await import("node:stream");
      if (payload instanceof Readable) {
        payload = await streamToBuffer(payload);
      } else if (typeof payload === "object" && payload && "pipe" in payload) {
        // Handle other stream-like objects that might not be instanceof Readable
        payload = await streamToBuffer(payload as Readable);
      }
    } catch (error) {
      // Log the specific error and throw a more descriptive error
      envLogger.log(`Failed to convert stream to buffer`, { key: s3Key, error }, { category: "S3Utils" });
      throw new Error(
        `Failed to convert stream to buffer: ${error instanceof Error ? error.message : String(error)}. ` +
          `This typically occurs when the stream is malformed or the x-amz-decoded-content-length header cannot be determined.`,
        { cause: error },
      );
    }
  }

  // Check if S3 writes are disabled (e.g., during build time)
  const { isS3ReadOnly } = await import("./utils/s3-read-only");
  if (isS3ReadOnly()) {
    if (isDebug) debug(`[S3Utils][READ-ONLY] Skipping S3 binary write for key: ${s3Key}`);
    return;
  }

  try {
    // writeToS3 handles the actual S3 put and its specific debug logging
    // Binary files (images, etc.) are typically public for CDN serving
    await writeToS3(s3Key, payload, contentType, "public-read");
    // Success is logged by writeToS3.
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : safeJsonStringify(error) || "Unknown error";
    envLogger.log(`Failed to write binary file to S3`, { key: s3Key, message }, { category: "S3Utils" });
    throw error; // Re-throw to let callers handle the error appropriately
  }
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Acquire a distributed lock using S3 for coordination */
export async function acquireDistributedLock(
  lockKey: string,
  instanceId: string,
  operation: string,
  timeoutMs: number = LOCK_TIMEOUT_MS,
  options?: { store?: LockStore; clock?: () => number },
): Promise<boolean> {
  const clock = options?.clock ?? Date.now;
  const store = options?.store ?? s3LockStore;
  const lockPath = `locks/${lockKey}.json`;
  const lockEntry: { instanceId: string; acquiredAt: number; operation: string } = {
    instanceId,
    acquiredAt: clock(),
    operation,
  };

  try {
    const existingLock = await store.read(lockPath);
    if (existingLock) {
      const age = clock() - existingLock.acquiredAt;
      if (age < timeoutMs) {
        return false; // Lock still active
      }
      // Stale lock: attempt best-effort cleanup before acquiring
      try {
        await store.delete(lockPath);
      } catch {
        // Ignore cleanup errors and proceed to conditional create
      }
    }
  } catch {
    // Lock doesn't exist, proceed to acquire
  }

  try {
    const created = await store.createIfAbsent(lockPath, lockEntry);
    if (!created) return false;
    // Read-back verification to confirm we own the lock after any concurrent writes
    const current = await store.read(lockPath);
    if (current && current.instanceId === lockEntry.instanceId && current.acquiredAt === lockEntry.acquiredAt) {
      return true;
    }
    // Someone else won the race
    return false;
  } catch (error: unknown) {
    // Check if it's a precondition failure (lock already exists)
    if (error && typeof error === "object" && "$metadata" in error) {
      const metadata = error.$metadata as { httpStatusCode?: number };
      if (metadata.httpStatusCode === 412) {
        // Another process holds the lock - this is expected, not an error
        return false;
      }
    }
    envLogger.log(`Failed to acquire lock`, { lockKey, error }, { category: "S3Utils" });
    return false;
  }
}

/** Release a distributed lock */
export async function releaseDistributedLock(
  lockKey: string,
  instanceId: string,
  options?: { store?: LockStore },
): Promise<void> {
  const store = options?.store ?? s3LockStore;
  const lockPath = `locks/${lockKey}.json`;

  try {
    const existingLock = await store.read(lockPath);
    if (existingLock?.instanceId === instanceId) {
      await store.delete(lockPath);
    }
  } catch (error) {
    envLogger.log(`Failed to release lock`, { lockKey, error }, { category: "S3Utils" });
  }
}

/** Clean up stale locks older than timeout */
export async function cleanupStaleLocks(
  timeoutMs: number = LOCK_TIMEOUT_MS,
  options?: { store?: LockStore; clock?: () => number },
): Promise<void> {
  const store = options?.store ?? s3LockStore;
  const clock = options?.clock ?? Date.now;
  try {
    const locks = await store.list("locks/");
    const now = clock();

    for (const lockKey of locks) {
      try {
        const lockData = await store.read(lockKey);
        if (lockData && now - lockData.acquiredAt > timeoutMs) {
          await store.delete(lockKey);
        }
      } catch {
        // Ignore errors for individual lock cleanup
      }
    }
  } catch (error) {
    envLogger.log("Failed to cleanup stale locks", { error }, { category: "S3Utils" });
  }
}

// Convenience wrapper object to enable simpler spying in tests
export const s3Json = {
  readJsonS3,
  writeJsonS3,
  listS3Objects,
  deleteFromS3,
} as const;
